import { App, MarkdownView, Notice, Plugin, PluginSettingTab, TFile, Editor } from "obsidian";
import { Comment, CommentManager } from "./commentManager";
import { buildMarkdownBlock as buildCommentMarkdownBlock } from "./core/markdownCommentBlocks";
import { SideNoteView } from "./SideNoteView";
import { SideNoteSettingTab } from "./SideNoteSettingTab";
import { createHighlightPlugin, forceUpdateEffect, EditorWithCM } from "./highlightPlugin";
import { switchToSideNoteView, generateHash, generateCommentId } from "./utils";
import { DEFAULT_SETTINGS } from "./types";
import type { PluginData, SideNoteSettings } from "./types";

export default class SideNote extends Plugin {
    commentManager: CommentManager;
    settings: SideNoteSettings;
    comments: Comment[] = [];
    private editorUpdateTimers: Record<string, number> = {};
    private readonly duplicateAddWindowMs = 800;
    private lastAddFingerprint: { key: string; at: number } | null = null;

    private registerFreshSettingTab(): void {
        const appWithSettings = this.app as App & {
            setting?: { pluginTabs?: Record<string, PluginSettingTab> };
        };
        const pluginTabs = appWithSettings.setting?.pluginTabs;
        if (pluginTabs && pluginTabs[this.manifest.id]) {
            delete pluginTabs[this.manifest.id];
        }
        this.addSettingTab(new SideNoteSettingTab(this.app, this));
    }

    private normalizeCommentsFolderPath(raw: string): string | null {
        const trimmed = raw.trim() || DEFAULT_SETTINGS.markdownFolder;
        if (trimmed.startsWith('/') || trimmed.split('/').some(seg => seg === '..')) {
            return null;
        }
        return trimmed.replace(/^\/+|\/+$/g, "");
    }

    private async ensureCommentFolder(): Promise<string> {
        const raw = this.settings.markdownFolder;
        const normalized = this.normalizeCommentsFolderPath(raw);
        if (!normalized) {
            new Notice("SideNote: Invalid comments folder path. Using default.");
            return DEFAULT_SETTINGS.markdownFolder;
        }
        const exists = await this.app.vault.adapter.exists(normalized);
        if (!exists) {
            await this.app.vault.createFolder(normalized);
        }
        return normalized;
    }

    private getSideNoteFilePath(notePath: string): string {
        const raw = this.settings.markdownFolder;
        const normalized = this.normalizeCommentsFolderPath(raw) ?? DEFAULT_SETTINGS.markdownFolder;
        const base = notePath.replace(/\.md$/i, "").replace(/\//g, "__");
        return `${normalized}/${base}-sidenote.md`;
    }

    private async writeCommentToMarkdown(notePath: string, excerpt: string, body: string, commentId: string): Promise<string> {
        await this.ensureCommentFolder();
        const filePath = this.getSideNoteFilePath(notePath);
        const block = buildCommentMarkdownBlock(excerpt, body, commentId);

        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
            const content = await this.app.vault.read(existing);
            const updated = content.trim().length === 0 ? block : `${content}\n\n${block}`;
            await this.app.vault.modify(existing, updated);
        } else {
            await this.app.vault.create(filePath, `# Side Notes for ${notePath}\n\n${block}`);
        }

        return filePath;
    }

    async onload() {
        await this.loadPluginData();

        this.commentManager = new CommentManager(this.comments);
        await this.migrateComments();

        this.registerEditorExtension([createHighlightPlugin(this)]);
        this.registerMarkdownPreviewHighlights();

        this.registerFreshSettingTab();

        this.registerView("sidenote-view", (leaf) => new SideNoteView(leaf, this));

        this.addCommand({
            id: "open-comment-view",
            name: "Open in Split View",
            callback: () => { void switchToSideNoteView(this.app); },
        });

        this.addCommand({
            id: "activate-view",
            name: "Open in Sidebar",
            callback: () => { this.activateView(); },
        });

        this.addCommand({
            id: "view-all-comments",
            name: "View all comments",
            icon: "list",
            callback: async () => {
                await this.activateView();
                this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
                    if (leaf.view instanceof SideNoteView) leaf.view.setShowAllNotes(true);
                });
            },
        });

        this.addCommand({
            id: "add-note-comment",
            name: "Add note comment",
            icon: "sticky-note",
            callback: () => {
                const file = this.app.workspace.getActiveFile();
                if (!file) {
                    new Notice("SideNote: No active file to comment on.");
                    return;
                }
                void this.openInlineNoteComment(file.path);
            },
        });

        this.addCommand({
            id: "add-comment-to-selection",
            name: "Add comment to selection",
            icon: "message-square",
            editorCallback: (editor, view) => {
                void this.openAddCommentModal(editor, view.file?.path);
            },
        });

        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                if (editor.somethingSelected()) {
                    menu.addItem((item) => {
                        item.setTitle("Add comment to selection")
                            .setIcon("message-square")
                            .onClick(() => this.openAddCommentModal(editor, view.file?.path));
                    });
                } else {
                    menu.addItem((item) => {
                        item.setTitle("Add note comment")
                            .setIcon("sticky-note")
                            .onClick(() => {
                                const file = view.file;
                                if (!file) return;
                                void this.openInlineNoteComment(file.path);
                            });
                    });
                }
            })
        );

        this.addRibbonIcon("message-square", "Side Note: Open in Sidebar", () => {
            this.activateView();
        });

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof MarkdownView) {
                    const file = leaf.view.file;
                    this.app.workspace.getLeavesOfType("sidenote-view").forEach(sideNoteLeaf => {
                        if (sideNoteLeaf.view instanceof SideNoteView) {
                            sideNoteLeaf.view.updateActiveFile(file);
                        }
                    });
                    this.refreshEditorDecorations();
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.commentManager.renameFile(oldPath, file.path);
                    void this.saveData();
                    this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
                        if (leaf.view instanceof SideNoteView) leaf.view.renderComments();
                    });
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file.path === '.obsidian/plugins/side-note/data.json' ||
                    (file instanceof TFile && file.name === 'data.json' && file.parent?.name === 'side-note')) {
                    try {
                        await this.loadPluginData();
                        await this.migrateComments();
                        this.commentManager.updateComments(this.comments);
                        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
                            if (leaf.view instanceof SideNoteView) leaf.view.renderComments();
                        });
                    } catch (error) {
                        console.error("Error reloading plugin data:", error);
                    }
                } else if (file instanceof TFile && file.extension === 'md') {
                    try {
                        const fileContent = await this.app.vault.read(file);
                        this.commentManager.updateCommentCoordinatesForFile(fileContent, file.path);
                        await this.saveData();
                        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
                            if (leaf.view instanceof SideNoteView) leaf.view.renderComments();
                        });
                    } catch (error) {
                        console.error("Error updating comment coordinates:", error);
                    }
                }
            })
        );

        // Note: no editor-change handler here. The highlight plugin tracks positions via
        // ChangeSet.mapPos() (OT-style) in its own update() method, so periodic
        // forceUpdateEffect dispatches from editor-change are not needed and would reset
        // OT-tracked positions back to (potentially stale) comment manager coordinates.
    }

    async activateViewAndHighlightComment(commentId: string) {
        await this.activateView();
        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
            if (leaf.view instanceof SideNoteView) leaf.view.highlightComment(commentId);
        });
    }

    async activateView() {
        const { workspace } = this.app;

        const leaves = workspace.getLeavesOfType("sidenote-view");
        let leaf = leaves.length > 0 ? leaves[0] : null;

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({ type: "sidenote-view", active: true });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
            if (leaf.view instanceof SideNoteView) {
                leaf.view.updateActiveFile(workspace.getActiveFile());
            }
        }
    }

    async onCommentsChanged(message: string) {
        await this.saveData();
        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
            if (leaf.view instanceof SideNoteView) leaf.view.renderComments();
        });
        this.refreshEditorDecorations();
        new Notice(message);
    }

    private createAddFingerprint(comment: Comment): string {
        return [
            comment.filePath,
            comment.startLine,
            comment.startChar,
            comment.endLine,
            comment.endChar,
            comment.selectedText,
            comment.comment,
        ].join("|");
    }

    async addComment(newComment: Comment) {
        const now = Date.now();
        const fingerprint = this.createAddFingerprint(newComment);
        if (
            this.lastAddFingerprint &&
            this.lastAddFingerprint.key === fingerprint &&
            now - this.lastAddFingerprint.at < this.duplicateAddWindowMs
        ) {
            return;
        }
        this.lastAddFingerprint = { key: fingerprint, at: now };
        this.commentManager.addComment(newComment);
        await this.onCommentsChanged("Comment added!");
    }

    async editComment(commentId: string, newCommentText: string) {
        this.commentManager.editComment(commentId, newCommentText);
        await this.onCommentsChanged("Comment updated!");
    }

    async deleteComment(commentId: string) {
        this.commentManager.deleteComment(commentId);
        await this.onCommentsChanged("Comment deleted!");
    }

    async resolveComment(commentId: string) {
        this.commentManager.resolveComment(commentId);
        await this.onCommentsChanged("Comment resolved!");
    }

    async unresolveComment(commentId: string) {
        this.commentManager.unresolveComment(commentId);
        await this.onCommentsChanged("Comment reopened!");
    }

    private async openAddCommentModal(editor: Editor, filePath: string | undefined) {
        const selection = editor.getSelection();
        if (!selection?.trim() || !filePath) {
            new Notice("Please select some text to add a comment.");
            return;
        }
        const cursorStart = editor.getCursor("from");
        const cursorEnd = editor.getCursor("to");
        const hash = await generateHash(selection);
        await this.activateView();
        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
            if (leaf.view instanceof SideNoteView) {
                leaf.view.openInlineNewComment({
                    filePath: filePath!,
                    isNoteComment: false,
                    selectedText: selection,
                    selectedTextHash: hash,
                    startLine: cursorStart.line,
                    startChar: cursorStart.ch,
                    endLine: cursorEnd.line,
                    endChar: cursorEnd.ch,
                });
            }
        });
    }

    private async openInlineNoteComment(filePath: string): Promise<void> {
        await this.activateView();
        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
            if (leaf.view instanceof SideNoteView) {
                leaf.view.openInlineNewComment({
                    filePath,
                    isNoteComment: true,
                    selectedText: "",
                    selectedTextHash: "",
                    startLine: 0,
                    startChar: 0,
                    endLine: 0,
                    endChar: 0,
                });
            }
        });
    }

    async loadPluginData() {
        const loadedData: PluginData = Object.assign({}, { comments: [] }, DEFAULT_SETTINGS, await this.loadData());
        this.settings = {
            commentSortOrder: loadedData.commentSortOrder || DEFAULT_SETTINGS.commentSortOrder,
            showHighlights: loadedData.showHighlights !== undefined ? loadedData.showHighlights : DEFAULT_SETTINGS.showHighlights,
            markdownFolder: loadedData.markdownFolder || DEFAULT_SETTINGS.markdownFolder,
            highlightColor: loadedData.highlightColor || DEFAULT_SETTINGS.highlightColor,
            highlightOpacity: loadedData.highlightOpacity !== undefined ? loadedData.highlightOpacity : DEFAULT_SETTINGS.highlightOpacity,
            showResolvedComments: loadedData.showResolvedComments !== undefined ? loadedData.showResolvedComments : DEFAULT_SETTINGS.showResolvedComments,
        };
        this.comments = loadedData.comments || [];
        this.applyHighlightColor();
    }

    async migrateComments() {
        let needsSave = false;

        for (const comment of this.comments) {
            if (!comment.id) {
                comment.id = generateCommentId();
                needsSave = true;
            }
            if (!comment.selectedTextHash && comment.selectedText) {
                comment.selectedTextHash = await generateHash(comment.selectedText);
                needsSave = true;
            }
            if (comment.isOrphaned === undefined) {
                comment.isOrphaned = false;
                needsSave = true;
            }
            if (comment.isNoteComment === undefined) {
                comment.isNoteComment = false;
                needsSave = true;
            }
        }

        if (needsSave) await this.saveData();
    }

    async migrateInlineCommentsToMarkdown() {
        let changed = false;
        for (const comment of this.comments) {
            if (!comment.commentPath) {
                const path = await this.writeCommentToMarkdown(
                    comment.filePath, comment.selectedText, comment.comment, comment.id
                );
                comment.commentPath = path;
                changed = true;
            }
        }
        if (changed) await this.saveData();
    }

    private registerMarkdownPreviewHighlights() {
        this.registerMarkdownPostProcessor((element, context) => {
            if (!element.closest('.markdown-preview-view')) return;
            if (!this.settings.showHighlights) return;

            const comments = this.commentManager
                .getCommentsForFile(context.sourcePath)
                .filter(c => !c.isOrphaned && !!c.selectedText);

            if (!comments.length) return;

            const textNodes: Array<{ node: Text; start: number; end: number }> = [];
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let offset = 0;

            while (walker.nextNode()) {
                const node = walker.currentNode as Text;
                const value = node.nodeValue || "";
                if (!value.length) continue;
                textNodes.push({ node, start: offset, end: offset + value.length });
                offset += value.length;
            }

            const fullText = textNodes.map(t => t.node.nodeValue || "").join("");
            if (!fullText.length) return;

            const wraps: Array<{ start: number; end: number; comment: Comment }> = [];
            for (const comment of comments) {
                if (!comment.selectedText) continue;
                const idx = fullText.indexOf(comment.selectedText);
                if (idx !== -1) wraps.push({ start: idx, end: idx + comment.selectedText.length, comment });
            }

            if (!wraps.length) return;

            const findPos = (absolute: number): { node: Text; offsetInNode: number } | null => {
                for (const entry of textNodes) {
                    if (absolute >= entry.start && absolute <= entry.end) {
                        return { node: entry.node, offsetInNode: absolute - entry.start };
                    }
                }
                return null;
            };

            wraps.sort((a, b) => b.start - a.start);

            for (const wrap of wraps) {
                const startPos = findPos(wrap.start);
                const endPos = findPos(wrap.end);
                if (!startPos || !endPos) continue;

                try {
                    const range = document.createRange();
                    range.setStart(startPos.node, startPos.offsetInNode);
                    range.setEnd(endPos.node, endPos.offsetInNode);

                    const span = document.createElement('span');
                    span.classList.add('sidenote-highlight', 'sidenote-highlight-preview');
                    span.dataset.commentId = wrap.comment.id;
                    span.addEventListener('click', (event: MouseEvent) => {
                        if (event.button !== 0) return;
                        void this.activateViewAndHighlightComment(wrap.comment.id);
                    });
                    span.addEventListener('contextmenu', () => { /* keep default */ });

                    range.surroundContents(span);
                } catch (e) {
                    console.warn('Failed to wrap preview highlight', e);
                }
            }
        });
    }

    applyHighlightColor() {
        const root = document.documentElement;
        const { highlightColor: color, highlightOpacity: opacity } = this.settings;
        const rgb = this.hexToRgb(color);

        root.style.setProperty('--sidenote-highlight-color', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
        root.style.setProperty('--sidenote-highlight-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(opacity + 0.15, 1)})`);
        root.style.setProperty('--sidenote-highlight-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(opacity + 0.4, 1)})`);
        root.style.setProperty('--sidenote-orphaned-color', `rgba(255, 100, 100, ${opacity})`);
        root.style.setProperty('--sidenote-orphaned-hover', `rgba(255, 100, 100, ${Math.min(opacity + 0.15, 1)})`);
        root.style.setProperty('--sidenote-orphaned-border', `rgba(255, 100, 100, ${Math.min(opacity + 0.35, 1)})`);

        this.refreshEditorDecorations();
    }

    hexToRgb(hex: string): { r: number; g: number; b: number } {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
            : { r: 255, g: 200, b: 0 };
    }

    async saveData() {
        const dataToSave: PluginData = { ...this.settings, comments: this.comments };
        await super.saveData(dataToSave);
        this.refreshEditorDecorations();
    }

    refreshEditorDecorations() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) {
                const cm = (leaf.view.editor as unknown as EditorWithCM).cm;
                if (cm?.dispatch) {
                    cm.dispatch({ effects: [forceUpdateEffect.of(null)] });
                }
            }
        });
    }
}

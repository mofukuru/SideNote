import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Notice, ViewStateResult, MarkdownRenderer, Scope, Platform, setIcon } from "obsidian";
import type { SideNotePlugin } from "./types";
import type { Comment } from "./commentManager";
import type { CustomViewState } from "./types";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ConfirmDiscardModal } from "./ConfirmDiscardModal";
import { generateCommentId } from "./utils";

interface PendingAdd {
    filePath: string;
    isNoteComment: boolean;
    selectedText: string;
    selectedTextHash: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
}

export class SideNoteView extends ItemView {
    private file: TFile | null = null;
    private plugin: SideNotePlugin;
    private activeCommentId: string | null = null;
    private showAllNotes = false;
    private searchQuery = "";
    private editingCommentId: string | null = null;
    private editingDraft = "";
    private pendingAdd: PendingAdd | null = null;
    private pendingAddDraft = "";
    private activeScope: Scope | null = null;
    /** 次の描画で textarea にフォーカスを当てるか。ユーザーが明示的に編集を開始した時だけ true になる */
    private focusOnNextRender = false;
    private editingSelectionStart: number | null = null;
    private editingSelectionEnd: number | null = null;
    private pendingAddSelectionStart: number | null = null;
    private pendingAddSelectionEnd: number | null = null;
    /**
     * 折りたたみ状態のユーザー操作による上書き。キーは comment.id。
     * エントリがなければデフォルト(resolved なら折りたたみ)に従う。
     */
    private collapseOverrides = new Map<string, boolean>();

    constructor(leaf: WorkspaceLeaf, plugin: SideNotePlugin, file: TFile | null = null) {
        super(leaf);
        this.plugin = plugin;
        this.file = file;
    }

    getViewType() { return "sidenote-view"; }
    getDisplayText() { return "Side Note"; }
    getIcon() { return "message-square"; }

    async onOpen() {
        if (!this.file) {
            this.file = this.app.workspace.getActiveFile();
        }
        this.registerDomEvent(document, 'click', () => {
            this.containerEl.querySelectorAll<HTMLElement>('.sidenote-action-menu.visible')
                .forEach(m => m.classList.remove('visible'));
        });
        this.renderComments();
    }

    async setState(state: CustomViewState, result: ViewStateResult): Promise<void> {
        if (state.filePath) {
            const file = this.app.vault.getAbstractFileByPath(state.filePath);
            if (file instanceof TFile) {
                this.file = file;
                this.renderComments();
            }
        }
        await super.setState(state, result);
    }

    public updateActiveFile(file: TFile | null) {
        this.file = file;
        this.renderComments();
    }

    public highlightComment(commentId: string) {
        this.activeCommentId = commentId;
        this.renderComments();
        setTimeout(() => {
            const commentEl = this.containerEl.querySelector(`[data-comment-id="${commentId}"]`);
            if (commentEl) {
                commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    public setShowAllNotes(value: boolean) {
        this.showAllNotes = value;
        this.renderComments();
    }

    /**
     * Called from main.ts when the user triggers "add comment" from the editor or command.
     * Switches to Current File view, renders the inline add form, and focuses the textarea.
     */
    public openInlineNewComment(info: PendingAdd): void {
        this.showAllNotes = false;
        this.editingCommentId = null;
        this.editingDraft = "";
        this.pendingAdd = info;
        this.pendingAddDraft = "";
        this.pendingAddSelectionStart = null;
        this.pendingAddSelectionEnd = null;
        this.focusOnNextRender = true;
        this.renderComments();
    }

    private getFileTitle(filePath: string): string {
        return filePath.split("/").pop()?.replace(/\.md$/i, "") ?? "Note";
    }

    private isCollapsed(comment: Comment): boolean {
        return this.collapseOverrides.get(comment.id) ?? comment.resolved ?? false;
    }

    private renderCommentItem(container: HTMLElement, comment: Comment) {
        const commentEl = container.createDiv("sidenote-comment-item");
        commentEl.setAttribute("data-comment-id", comment.id);

        if (comment.resolved) commentEl.addClass("resolved");
        if (comment.isNoteComment) commentEl.addClass("sidenote-note-comment");
        if (this.activeCommentId === comment.id) commentEl.addClass("active");

        const isEditing = this.editingCommentId === comment.id;
        if (isEditing) commentEl.addClass("sidenote-editing");

        const collapsed = !isEditing && this.isCollapsed(comment);
        if (collapsed) commentEl.addClass("sidenote-collapsed");

        // --- Header (always visible) ---
        const headerEl = commentEl.createDiv("sidenote-comment-header");
        const collapseBtn = headerEl.createEl("button", { cls: "sidenote-collapse-button" });
        setIcon(collapseBtn, collapsed ? "chevron-right" : "chevron-down");
        collapseBtn.setAttribute("aria-label", collapsed ? "Expand comment" : "Collapse comment");
        collapseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.collapseOverrides.set(comment.id, !collapsed);
            this.renderComments();
        });
        const textInfoEl = headerEl.createDiv("sidenote-comment-text-info");
        textInfoEl.createEl("h4", {
            text: comment.isNoteComment ? this.getFileTitle(comment.filePath) : comment.selectedText,
            cls: "sidenote-selected-text",
        });
        textInfoEl.createEl("small", {
            text: new Date(comment.timestamp).toLocaleString(),
            cls: "sidenote-timestamp",
        });

        // --- Single click: jump to editor (skipped in edit mode) ---
        commentEl.addEventListener('click', async (event) => {
            if (isEditing) return;
            if ((event.target as HTMLElement)?.closest('a')) return;
            if (event.detail > 1) return;

            let targetLeaf: WorkspaceLeaf | null = null;
            this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
                if (leaf.view instanceof MarkdownView && leaf.view.file?.path === comment.filePath) {
                    targetLeaf = leaf;
                    return false;
                }
            });

            if (!targetLeaf) {
                const file = this.app.vault.getAbstractFileByPath(comment.filePath);
                if (file instanceof TFile) {
                    const newLeaf = this.app.workspace.getLeaf(true);
                    await newLeaf.openFile(file);
                    targetLeaf = newLeaf;
                }
            }

            if (targetLeaf && targetLeaf.view instanceof MarkdownView) {
                this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                const editor = targetLeaf.view.editor;
                // Defer selection + scroll so that setActiveLeaf's side-effects
                // (focus event, active-leaf-change, layout recalc) all finish
                // before we set the scroll position. Calling editor.focus() after
                // scrollIntoView would trigger the browser's focus-scroll which
                // uses "nearest" and overrides our centered position, so we omit
                // it — setActiveLeaf({ focus: true }) already handles focus.
                setTimeout(() => {
                    editor.setSelection(
                        { line: comment.startLine, ch: comment.startChar },
                        { line: comment.endLine, ch: comment.endChar }
                    );
                    editor.scrollIntoView(
                        { from: { line: comment.startLine, ch: comment.startChar },
                          to:   { line: comment.endLine,   ch: comment.endChar } },
                        true
                    );
                }, 50);
            } else {
                new Notice("Failed to jump to Markdown view.");
            }
        });

        // --- Double click: enter inline edit mode ---
        commentEl.addEventListener('dblclick', (event) => {
            if (isEditing) return;
            if ((event.target as HTMLElement)?.closest('a')) return;
            event.stopPropagation();
            this.collapseOverrides.set(comment.id, false);
            this.editingCommentId = comment.id;
            this.editingDraft = comment.comment;
            this.editingSelectionStart = null;
            this.editingSelectionEnd = null;
            this.focusOnNextRender = true;
            this.renderComments();
        });

        if (isEditing) {
            // --- Inline edit form ---
            this.renderInlineEditForm(
                commentEl,
                comment.filePath,
                this.canSaveEmpty(comment.isNoteComment),
                async (text) => {
                    this.editingCommentId = null;
                    this.editingDraft = "";
                    this.editingSelectionStart = null;
                    this.editingSelectionEnd = null;
                    await this.plugin.editComment(comment.id, text);
                },
                () => {
                    const discard = () => {
                        this.editingCommentId = null;
                        this.editingDraft = "";
                        this.editingSelectionStart = null;
                        this.editingSelectionEnd = null;
                        this.renderComments();
                    };
                    if (this.editingDraft !== comment.comment) {
                        new ConfirmDiscardModal(this.app, discard, () => {
                            commentEl.querySelector<HTMLTextAreaElement>('.sidenote-edit-textarea')?.focus();
                        }).open();
                    } else {
                        discard();
                    }
                }
            );
        } else {
            // --- Action menu ---
            const actionsEl = headerEl.createDiv("sidenote-comment-actions");
            const menuButton = actionsEl.createEl("button", { text: "...", cls: "sidenote-menu-button" });
            const menuContainer = actionsEl.createDiv("sidenote-action-menu");

            const editOption = menuContainer.createEl("button", { text: "Edit", cls: "sidenote-menu-option sidenote-menu-edit" });
            editOption.onclick = (e) => {
                e.stopPropagation();
                menuContainer.classList.remove("visible");
                this.collapseOverrides.set(comment.id, false);
                this.editingCommentId = comment.id;
                this.editingDraft = comment.comment;
                this.editingSelectionStart = null;
                this.editingSelectionEnd = null;
                this.focusOnNextRender = true;
                this.renderComments();
            };

            const deleteOption = menuContainer.createEl("button", { text: "Delete", cls: "sidenote-menu-option sidenote-menu-delete" });
            deleteOption.onclick = (e) => {
                e.stopPropagation();
                menuContainer.classList.remove("visible");
                new ConfirmDeleteModal(this.app, () => this.plugin.deleteComment(comment.id)).open();
            };

            const resolveOption = menuContainer.createEl("button", {
                text: comment.resolved ? "Reopen" : "Resolve",
                cls: "sidenote-menu-option sidenote-menu-resolve",
            });
            resolveOption.onclick = (e) => {
                e.stopPropagation();
                menuContainer.classList.remove("visible");
                this.collapseOverrides.delete(comment.id);
                if (comment.resolved) {
                    this.plugin.unresolveComment(comment.id);
                } else {
                    this.plugin.resolveComment(comment.id);
                }
            };

            menuButton.onclick = (e) => {
                e.stopPropagation();
                menuContainer.classList.toggle("visible");
            };

            if (!collapsed && comment.comment) {
                // --- Rendered comment content ---
                // markdown-rendered is required so Obsidian's CSS scopes (blockquote,
                // callout, etc.) resolve correctly inside a custom ItemView.
                const contentWrapper = commentEl.createDiv({ cls: "sidenote-comment-content markdown-rendered" });
                const commentText = comment.comment || "";
                void MarkdownRenderer.render(this.app, commentText, contentWrapper, comment.filePath, this);

                // Custom ItemView context: Obsidian's workspace-level link handler does not fire here.
                contentWrapper.addEventListener('click', (e: MouseEvent) => {
                    const linkEl = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
                    if (!linkEl) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href') || '';
                    if (!href) return;
                    if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(href)) {
                        window.open(href, '_blank');
                        return;
                    }
                    this.app.workspace.openLinkText(href, comment.filePath, e.ctrlKey || e.metaKey);
                });
            }
        }
    }

    // --- Obsidian Scope helpers ---
    // Ctrl+Enter and Esc must be registered via app.keymap rather than relying on
    // DOM keydown events, because Obsidian processes global hotkeys in the capturing
    // phase — before a textarea's bubbling listener ever fires.

    private pushEditScope(onSave: () => void, onCancel: () => void): void {
        const scope = new Scope(this.app.scope);
        scope.register(['Ctrl'], 'Enter', () => { onSave(); return false; });
        scope.register(['Meta'], 'Enter', () => { onSave(); return false; });
        scope.register([], 'Escape', () => { onCancel(); return false; });
        this.app.keymap.pushScope(scope);
        this.activeScope = scope;
    }

    private popEditScope(): void {
        if (this.activeScope) {
            this.app.keymap.popScope(this.activeScope);
            this.activeScope = null;
        }
    }

    private renderShortcutHint(form: HTMLElement): void {
        const modKey = Platform.isMacOS ? "⌘" : "Ctrl";
        form.createEl("div", {
            text: `${modKey}+Enter to save · Esc to cancel`,
            cls: "sidenote-edit-hint",
        });
    }

    /** filePath を開いている Markdown エディタの現在の選択テキストを返す(なければ null) */
    private getEditorSelection(filePath: string): string | null {
        let selection: string | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
                const text = leaf.view.editor.getSelection();
                if (text) selection = text;
            }
        });
        return selection;
    }

    private insertQuoteIntoTextarea(
        textarea: HTMLTextAreaElement,
        filePath: string,
        syncDraft: (value: string) => void,
    ): void {
        const selection = this.getEditorSelection(filePath);
        if (!selection || !selection.trim()) {
            new Notice("Select text in the note first.");
            return;
        }
        const quote = selection.split("\n").map(line => `> ${line}`).join("\n");
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        const prefix = before && !before.endsWith("\n") ? "\n" : "";
        const inserted = `${prefix}${quote}\n`;
        textarea.value = before + inserted + after;
        syncDraft(textarea.value);
        const caret = (before + inserted).length;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
    }

    /** Note comments always need text; selection comments may be empty highlights if enabled. */
    private canSaveEmpty(isNoteComment: boolean | undefined): boolean {
        return this.plugin.settings.allowEmptyComments && !isNoteComment;
    }

    private renderInlineEditForm(
        container: HTMLElement,
        filePath: string,
        allowEmpty: boolean,
        onSave: (text: string) => Promise<void>,
        onCancel: () => void,
    ) {
        const form = container.createDiv({ cls: "sidenote-edit-form" });
        const textarea = form.createEl("textarea", { cls: "sidenote-edit-textarea" });
        textarea.value = this.editingDraft;
        if (this.editingSelectionStart !== null && this.editingSelectionEnd !== null) {
            textarea.setSelectionRange(this.editingSelectionStart, this.editingSelectionEnd);
        }
        textarea.addEventListener('input', () => {
            this.editingDraft = textarea.value;
            this.editingSelectionStart = textarea.selectionStart;
            this.editingSelectionEnd = textarea.selectionEnd;
        });

        const doSave = async () => {
            const text = this.editingDraft.trim();
            if (!text && !allowEmpty) return;
            await onSave(text);
        };

        this.pushEditScope(() => void doSave(), onCancel);

        const actionsDiv = form.createDiv({ cls: "sidenote-edit-actions" });
        const quoteBtn = actionsDiv.createEl("button", { text: "Quote selection", cls: "sidenote-edit-quote" });
        const saveBtn = actionsDiv.createEl("button", { text: "Save", cls: "mod-cta sidenote-edit-save" });
        const cancelBtn = actionsDiv.createEl("button", { text: "Cancel", cls: "sidenote-edit-cancel" });

        quoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.insertQuoteIntoTextarea(textarea, filePath, (value) => {
                this.editingDraft = value;
                this.editingSelectionStart = textarea.selectionStart;
                this.editingSelectionEnd = textarea.selectionEnd;
            });
        });
        saveBtn.addEventListener('click', (e) => { e.stopPropagation(); void doSave(); });
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); onCancel(); });
        this.renderShortcutHint(form);

        if (this.focusOnNextRender) {
            this.focusOnNextRender = false;
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 30);
        }
    }

    private renderInlineAddForm(container: HTMLElement) {
        const pa = this.pendingAdd!;
        const form = container.createDiv({ cls: "sidenote-new-comment-form" });

        const labelText = pa.isNoteComment ? this.getFileTitle(pa.filePath) : pa.selectedText;
        form.createEl("div", { text: labelText, cls: "sidenote-new-comment-label" });

        const textarea = form.createEl("textarea", {
            cls: "sidenote-edit-textarea",
            attr: { placeholder: "Write your comment…" },
        });
        textarea.value = this.pendingAddDraft;
        if (this.pendingAddSelectionStart !== null && this.pendingAddSelectionEnd !== null) {
            textarea.setSelectionRange(this.pendingAddSelectionStart, this.pendingAddSelectionEnd);
        }
        textarea.addEventListener('input', () => {
            this.pendingAddDraft = textarea.value;
            this.pendingAddSelectionStart = textarea.selectionStart;
            this.pendingAddSelectionEnd = textarea.selectionEnd;
        });

        const saveNew = async () => {
            const text = this.pendingAddDraft.trim();
            if (!text && !this.canSaveEmpty(pa.isNoteComment)) return;
            const info = this.pendingAdd!;
            this.pendingAdd = null;
            this.pendingAddDraft = "";
            const newComment: Comment = {
                id: generateCommentId(),
                filePath: info.filePath,
                startLine: info.startLine,
                startChar: info.startChar,
                endLine: info.endLine,
                endChar: info.endChar,
                selectedText: info.selectedText,
                selectedTextHash: info.selectedTextHash,
                comment: text,
                timestamp: Date.now(),
                isOrphaned: false,
                isNoteComment: info.isNoteComment,
            };
            await this.plugin.addComment(newComment);
        };

        const cancelNew = () => {
            const discard = () => {
                this.pendingAdd = null;
                this.pendingAddDraft = "";
                this.pendingAddSelectionStart = null;
                this.pendingAddSelectionEnd = null;
                this.renderComments();
            };
            if (this.pendingAddDraft.trim() !== "") {
                new ConfirmDiscardModal(this.app, discard, () => textarea.focus()).open();
            } else {
                discard();
            }
        };

        this.pushEditScope(() => void saveNew(), cancelNew);

        const actionsDiv = form.createDiv({ cls: "sidenote-edit-actions" });
        const quoteBtn = actionsDiv.createEl("button", { text: "Quote selection", cls: "sidenote-edit-quote" });
        const addBtn = actionsDiv.createEl("button", { text: "Add", cls: "mod-cta sidenote-edit-save" });
        const cancelBtn = actionsDiv.createEl("button", { text: "Cancel", cls: "sidenote-edit-cancel" });

        quoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.insertQuoteIntoTextarea(textarea, pa.filePath, (value) => {
                this.pendingAddDraft = value;
                this.pendingAddSelectionStart = textarea.selectionStart;
                this.pendingAddSelectionEnd = textarea.selectionEnd;
            });
        });
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); void saveNew(); });
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cancelNew(); });
        this.renderShortcutHint(form);

        if (this.focusOnNextRender) {
            this.focusOnNextRender = false;
            setTimeout(() => textarea.focus(), 30);
        }
    }

    /** 設定に従ってコメント配列をその場でソートする */
    private sortComments(comments: Comment[]): void {
        if (this.plugin.settings.commentSortOrder === "position") {
            comments.sort((a, b) =>
                a.startLine !== b.startLine ? a.startLine - b.startLine : a.startChar - b.startChar
            );
        } else {
            comments.sort((a, b) => a.timestamp - b.timestamp);
        }
        if (this.plugin.settings.commentSortDescending) {
            comments.reverse();
        }
    }

    public renderComments() {
        this.popEditScope();
        this.containerEl.empty();
        this.containerEl.addClass("sidenote-view-container");

        const viewHeader = this.containerEl.createDiv("sidenote-view-header");
        const toggleBtn = viewHeader.createEl("button", {
            text: this.showAllNotes ? "All Notes" : "Current File",
            cls: "sidenote-view-toggle",
        });
        toggleBtn.onclick = () => {
            this.showAllNotes = !this.showAllNotes;
            this.renderComments();
        };

        // Quick-access mirror of the global "Show resolved comments" setting.
        const resolvedToggle = viewHeader.createEl("label", {
            cls: "sidenote-resolved-toggle",
            attr: { "aria-label": "Show resolved comments" },
        });
        const resolvedCheckbox = resolvedToggle.createEl("input", { attr: { type: "checkbox" } });
        resolvedCheckbox.checked = this.plugin.settings.showResolvedComments;
        resolvedToggle.createSpan({ text: "Resolved" });
        resolvedCheckbox.addEventListener("change", async () => {
            this.plugin.settings.showResolvedComments = resolvedCheckbox.checked;
            await this.plugin.saveData();
            this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
                if (leaf.view instanceof SideNoteView) leaf.view.renderComments();
            });
        });

        const searchInput = viewHeader.createEl("input", {
            cls: "sidenote-search-input",
            attr: { type: "text", placeholder: "Search comments..." },
        });
        searchInput.value = this.searchQuery;

        const applySearch = () => {
            this.searchQuery = searchInput.value;
            this.renderComments();
            const newInput = this.containerEl.querySelector<HTMLInputElement>('.sidenote-search-input');
            if (newInput) {
                newInput.focus();
                newInput.setSelectionRange(newInput.value.length, newInput.value.length);
            }
        };

        let composing = false;
        searchInput.addEventListener('compositionstart', () => { composing = true; });
        searchInput.addEventListener('compositionend', () => { composing = false; applySearch(); });
        searchInput.addEventListener('input', () => { if (!composing) applySearch(); });

        if (this.showAllNotes) {
            this.renderAllNotesView();
            return;
        }

        if (this.file) {
            let commentsForFile = this.plugin.commentManager.getCommentsForFile(this.file.path);
            const hasHiddenResolved = !this.plugin.settings.showResolvedComments && commentsForFile.some(c => c.resolved);

            if (!this.plugin.settings.showResolvedComments) {
                commentsForFile = commentsForFile.filter(c => !c.resolved);
            }

            if (this.searchQuery.trim()) {
                const q = this.searchQuery.toLowerCase();
                commentsForFile = commentsForFile.filter(c =>
                    c.comment.toLowerCase().includes(q) ||
                    c.selectedText.toLowerCase().includes(q)
                );
            }

            this.sortComments(commentsForFile);

            const commentsContainer = this.containerEl.createDiv("sidenote-comments-container");

            // Inline add form (shown when triggered from the editor or note-comment button)
            if (this.pendingAdd && this.pendingAdd.filePath === this.file.path) {
                this.renderInlineAddForm(commentsContainer);
            }

            if (commentsForFile.length > 0) {
                commentsForFile.forEach(comment => this.renderCommentItem(commentsContainer, comment));
            } else if (!this.pendingAdd) {
                const emptyStateEl = commentsContainer.createDiv("sidenote-empty-state");
                if (this.searchQuery.trim()) {
                    emptyStateEl.createEl("p", { text: "No comments match your search." });
                } else if (hasHiddenResolved) {
                    emptyStateEl.createEl("p", { text: "All comments in this file are resolved." });
                    emptyStateEl.createEl("p", { text: "Check 'Resolved' above to show them." });
                } else {
                    emptyStateEl.createEl("p", { text: "No comments for this file yet." });
                    emptyStateEl.createEl("p", { text: "Select text in your note and use the 'add comment to selection' command to get started." });
                }
            }
        } else {
            const emptyStateEl = this.containerEl.createDiv("sidenote-empty-state");
            emptyStateEl.createEl("p", { text: "No file selected." });
            emptyStateEl.createEl("p", { text: "Open a file to see its comments." });
        }
    }

    private renderAllNotesView() {
        let allComments = this.plugin.commentManager.getComments();

        if (!this.plugin.settings.showResolvedComments) {
            allComments = allComments.filter(c => !c.resolved);
        }

        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase();
            allComments = allComments.filter(c =>
                c.comment.toLowerCase().includes(q) ||
                c.selectedText.toLowerCase().includes(q)
            );
        }

        if (allComments.length === 0) {
            const emptyStateEl = this.containerEl.createDiv("sidenote-empty-state");
            emptyStateEl.createEl("p", {
                text: this.searchQuery.trim()
                    ? "No comments match your search."
                    : "No comments found across all notes."
            });
            return;
        }

        const byFile = new Map<string, typeof allComments>();
        for (const comment of allComments) {
            const group = byFile.get(comment.filePath) ?? [];
            group.push(comment);
            byFile.set(comment.filePath, group);
        }

        const commentsContainer = this.containerEl.createDiv("sidenote-comments-container");
        for (const [filePath, comments] of byFile) {
            const fileName = filePath.split("/").pop() ?? filePath;
            const fileSection = commentsContainer.createDiv("sidenote-file-section");
            fileSection.createEl("h3", { text: fileName, cls: "sidenote-file-heading" });

            const sorted = [...comments];
            this.sortComments(sorted);

            for (const comment of sorted) {
                this.renderCommentItem(fileSection, comment);
            }
        }
    }

    getState(): CustomViewState {
        return { filePath: this.file?.path ?? null };
    }

    onunload() {}
}

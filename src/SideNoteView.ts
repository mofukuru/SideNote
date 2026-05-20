import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Notice, ViewStateResult, MarkdownRenderer } from "obsidian";
import type { SideNotePlugin } from "./types";
import type { Comment } from "./commentManager";
import type { CustomViewState } from "./types";
import { CommentModal } from "./CommentModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

export class SideNoteView extends ItemView {
    private file: TFile | null = null;
    private plugin: SideNotePlugin;
    private activeCommentId: string | null = null;
    private showAllNotes = false;
    private searchQuery = "";

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

    private renderCommentItem(container: HTMLElement, comment: Comment) {
        const commentEl = container.createDiv("sidenote-comment-item");
        commentEl.setAttribute("data-comment-id", comment.id);

        if (comment.resolved) commentEl.addClass("resolved");
        if (this.activeCommentId === comment.id) commentEl.addClass("active");

        const headerEl = commentEl.createDiv("sidenote-comment-header");
        const textInfoEl = headerEl.createDiv("sidenote-comment-text-info");
        textInfoEl.createEl("h4", { text: comment.selectedText, cls: "sidenote-selected-text" });
        textInfoEl.createEl("small", { text: new Date(comment.timestamp).toLocaleString(), cls: "sidenote-timestamp" });

        const actionsEl = headerEl.createDiv("sidenote-comment-actions");

        // Single click: jump to the highlighted text in the editor
        // (skipped when clicking a link, or as part of a double-click)
        commentEl.addEventListener('click', async (event) => {
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
                editor.setSelection(
                    { line: comment.startLine, ch: comment.startChar },
                    { line: comment.endLine, ch: comment.endChar }
                );
                editor.scrollIntoView(
                    { from: { line: comment.startLine, ch: 0 }, to: { line: comment.endLine, ch: 0 } },
                    true
                );
                editor.focus();
            } else {
                new Notice("Failed to jump to Markdown view.");
            }
        });

        // Double click: open edit modal
        commentEl.addEventListener('dblclick', (event) => {
            if ((event.target as HTMLElement)?.closest('a')) return;
            event.stopPropagation();
            new CommentModal(this.app, async (editedComment) => {
                await this.plugin.editComment(comment.id, editedComment);
            }, comment.comment).open();
        });

        const contentWrapper = commentEl.createDiv({ cls: "sidenote-comment-content" });
        MarkdownRenderer.renderMarkdown(comment.comment || "", contentWrapper, comment.filePath, this);

        // Custom ItemView context: Obsidian's workspace-level link handler does not fire here.
        // Intercept internal-link clicks explicitly and stop propagation so comment navigation is skipped.
        contentWrapper.addEventListener('click', (e: MouseEvent) => {
            const linkEl = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
            if (!linkEl) return;
            e.preventDefault();
            e.stopPropagation();
            const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href') || '';
            if (href) this.app.workspace.openLinkText(href, comment.filePath, false);
        });

        const menuButton = actionsEl.createEl("button", { text: "...", cls: "sidenote-menu-button" });
        const menuContainer = actionsEl.createDiv("sidenote-action-menu");

        const editOption = menuContainer.createEl("button", { text: "Edit", cls: "sidenote-menu-option sidenote-menu-edit" });
        editOption.onclick = (e) => {
            e.stopPropagation();
            menuContainer.classList.remove("visible");
            new CommentModal(this.app, async (editedComment) => {
                await this.plugin.editComment(comment.id, editedComment);
            }, comment.comment).open();
        };

        const deleteOption = menuContainer.createEl("button", { text: "Delete", cls: "sidenote-menu-option sidenote-menu-delete" });
        deleteOption.onclick = (e) => {
            e.stopPropagation();
            menuContainer.classList.remove("visible");
            new ConfirmDeleteModal(this.app, () => this.plugin.deleteComment(comment.id)).open();
        };

        const resolveOption = menuContainer.createEl("button", {
            text: comment.resolved ? "Reopen" : "Resolve",
            cls: "sidenote-menu-option sidenote-menu-resolve"
        });
        resolveOption.onclick = (e) => {
            e.stopPropagation();
            menuContainer.classList.remove("visible");
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
    }

    public renderComments() {
        this.containerEl.empty();
        this.containerEl.addClass("sidenote-view-container");

        const viewHeader = this.containerEl.createDiv("sidenote-view-header");
        const toggleBtn = viewHeader.createEl("button", {
            text: this.showAllNotes ? "Current File" : "All Notes",
            cls: "sidenote-view-toggle",
        });
        toggleBtn.onclick = () => {
            this.showAllNotes = !this.showAllNotes;
            this.renderComments();
        };

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

        // Skip DOM rebuild during IME composition (Japanese, Chinese, Korean, etc.)
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

            if (this.plugin.settings.commentSortOrder === "position") {
                commentsForFile.sort((a, b) =>
                    a.startLine !== b.startLine ? a.startLine - b.startLine : a.startChar - b.startChar
                );
            } else {
                commentsForFile.sort((a, b) => a.timestamp - b.timestamp);
            }

            if (commentsForFile.length > 0) {
                const commentsContainer = this.containerEl.createDiv("sidenote-comments-container");
                commentsForFile.forEach(comment => this.renderCommentItem(commentsContainer, comment));
            } else {
                const emptyStateEl = this.containerEl.createDiv("sidenote-empty-state");
                if (this.searchQuery.trim()) {
                    emptyStateEl.createEl("p", { text: "No comments match your search." });
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
            if (this.plugin.settings.commentSortOrder === "position") {
                sorted.sort((a, b) => a.startLine !== b.startLine ? a.startLine - b.startLine : a.startChar - b.startChar);
            } else {
                sorted.sort((a, b) => a.timestamp - b.timestamp);
            }

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

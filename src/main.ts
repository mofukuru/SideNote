import { ItemView, WorkspaceLeaf, TFile, App, MarkdownView, Notice, ViewStateResult, Plugin, Modal, Setting, PluginSettingTab } from "obsidian";
import { Comment, CommentManager } from "./commentManager";

interface CustomViewState extends Record<string, unknown> {
    filePath: string | null;
}

interface SideNoteSettings {
    commentSortOrder: "timestamp" | "position";
}

// Define a new interface for the entire plugin data
interface PluginData extends SideNoteSettings {
    comments: Comment[];
}

const DEFAULT_SETTINGS: SideNoteSettings = {
    commentSortOrder: "position",
};

class SideNoteView extends ItemView {
    private file: TFile | null = null;
    private plugin: SideNote;

    constructor(leaf: WorkspaceLeaf, plugin: SideNote, file: TFile | null = null) {
        super(leaf);
        this.plugin = plugin;
        this.file = file;
    }

    getViewType() {
        return "sidenote-view";
    }

    getDisplayText() {
        return "Sidenote view";
    }

    async onOpen() {
        await Promise.resolve();
        this.renderComments();
    }

    async setState(state: CustomViewState, result: ViewStateResult): Promise<void> {
        if (state.filePath) {
            const file = this.app.vault.getAbstractFileByPath(state.filePath);
            if (file instanceof TFile) {
                this.file = file;
                this.renderComments(); // ファイルが変更されたらコメントを再レンダリング
            }
        }
        await super.setState(state, result);
    }

    public renderComments() { // Made public for settings tab to re-render
        this.containerEl.empty();
        this.containerEl.addClass("sidenote-view-container");
        if (this.file) {
            let commentsForFile = this.plugin.commentManager.getCommentsForFile(this.file.path);

            // Sort comments based on setting
            if (this.plugin.settings.commentSortOrder === "position") {
                commentsForFile.sort((a, b) => {
                    if (a.startLine === b.startLine) {
                        return a.startChar - b.startChar;
                    }
                    return a.startLine - b.startLine;
                });
            } else { // Default to timestamp
                commentsForFile.sort((a, b) => a.timestamp - b.timestamp);
            }

            if (commentsForFile.length > 0) {
                const commentsContainer = this.containerEl.createDiv("sidenote-comments-container");
                commentsForFile.forEach((comment) => {
                    const commentEl = commentsContainer.createDiv("sidenote-comment-item");

                    const headerEl = commentEl.createDiv("sidenote-comment-header");
                    const textInfoEl = headerEl.createDiv("sidenote-comment-text-info");
                    textInfoEl.createEl("h4", { text: comment.selectedText, cls: "sidenote-selected-text" });
                    textInfoEl.createEl("small", { text: new Date(comment.timestamp).toLocaleString(), cls: "sidenote-timestamp" });

                    const actionsEl = headerEl.createDiv("sidenote-comment-actions");

                    // クリックでエディタの該当箇所にジャンプ
                    commentEl.onclick = async () => {
                        let targetLeaf: WorkspaceLeaf | null = null;
                        // Try to find an existing Markdown view for the file
                        this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
                            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === comment.filePath) {
                                targetLeaf = leaf;
                                return false; // Stop iteration
                            }
                        });

                        // If no existing view, open a new one.
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

                            // Set selection
                            editor.setSelection(
                                { line: comment.startLine, ch: comment.startChar },
                                { line: comment.endLine, ch: comment.endChar }
                            );

                            // Scroll to the selection
                            editor.scrollIntoView({
                                from: { line: comment.startLine, ch: 0 },
                                to: { line: comment.endLine, ch: 0 }
                            }, true);

                            editor.focus();
                        } else {
                            new Notice("Failed to jump to Markdown view.");
                        }
                    };

                    commentEl.createEl("p", { text: comment.comment, cls: "sidenote-comment-content" });

                    const editButton = actionsEl.createEl("button", { text: "Edit", cls: "sidenote-edit-button" });
                    editButton.onclick = (e) => {
                        e.stopPropagation(); // Prevent the comment item's click event
                        new CommentModal(this.app, (editedComment) => {
                            this.plugin.editComment(comment.timestamp, editedComment);
                        }, comment.comment).open();
                    };

                    const deleteButton = actionsEl.createEl("button", { text: "Delete", cls: "sidenote-delete-button" });
                    deleteButton.onclick = (e) => {
                        e.stopPropagation(); // Prevent the comment item's click event
                        this.plugin.deleteComment(comment.timestamp);
                    };
                });
            } else {
                const emptyStateEl = this.containerEl.createDiv("sidenote-empty-state");
                emptyStateEl.createEl("p", { text: "No comments for this file yet." });
                emptyStateEl.createEl("p", { text: "Select text in your note and use the 'Add comment to selection' command to get started." });
            }
        } else {
            const emptyStateEl = this.containerEl.createDiv("sidenote-empty-state");
            emptyStateEl.createEl("p", { text: "No file selected." });
            emptyStateEl.createEl("p", { text: "Open a file to see its comments." });
        }
    }

    getState(): CustomViewState {
        return {
            filePath: this.file ? this.file.path : null,
        };
    }

    onunload() {
    }
}

// ビューを切り替える関数
async function switchToSideNoteView(app: App) {
    const activeFile = app.workspace.getActiveFile();

    if (!activeFile) {
        new Notice("No active Markdown file found.");
        return;
    }

    let leaf: WorkspaceLeaf | null = null;
    try {
        // 'split'モードで新しいリーフを右側に作成
        leaf = app.workspace.getLeaf('split', 'vertical');
    } catch (error) {
        new Notice("Failed to create a new split view for comments.");
        console.error("Error creating split leaf:", error);
        return;
    }

    if (leaf) {
        await leaf.setViewState({
            type: "sidenote-view",
            state: { filePath: activeFile.path }, // CustomViewStateはfilePathを期待
            active: true, // 新しいビューをアクティブにする
        });
        app.workspace.revealLeaf(leaf); // リーフが表示されるようにする
    } else {
        new Notice("Failed to create or find a leaf for the comment view.");
    }
}

class CommentModal extends Modal {
    comment: string;
    onSubmit: (comment: string) => void;
    initialComment: string;

    constructor(app: App, onSubmit: (comment: string) => void, initialComment: string = '') {
        super(app);
        this.onSubmit = onSubmit;
        this.initialComment = initialComment;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("sidenote-comment-modal");

        contentEl.createEl("h2", { text: this.initialComment ? "Edit comment" : "Add comment" });

        const inputContainer = contentEl.createDiv("sidenote-comment-input-container");
        const input = inputContainer.createEl("textarea");
        input.placeholder = "Enter your comment...";
        input.value = this.initialComment;

        const footer = contentEl.createDiv("sidenote-modal-footer");
        const button = footer.createEl("button", {
            text: this.initialComment ? "Save" : "Add",
            cls: "mod-cta"
        });
        button.onclick = () => {
            this.comment = input.value;
            this.onSubmit(this.comment);
            this.close();
        };

        input.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SideNoteSettingTab extends PluginSettingTab {
    plugin: SideNote;

    constructor(app: App, plugin: SideNote) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();



        new Setting(containerEl)
            .setName("Comment sort order")
            .setDesc("Choose how comments are sorted in the custom view.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("timestamp", "By timestamp")
                    .addOption("position", "By position in file")
                    .setValue(this.plugin.settings.commentSortOrder)
                    .onChange(async (value: "timestamp" | "position") => {
                        this.plugin.settings.commentSortOrder = value;
                        await this.plugin.saveData(); // Save all plugin data
                        // Re-render the custom view if it's open to apply the new sort order
                        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
                            if (leaf.view instanceof SideNoteView) {
                                leaf.view.renderComments();
                            }
                        });
                    })
            );
    }
}

// プラグインのアクティベーション処理
export default class SideNote extends Plugin {
    commentManager: CommentManager;
    settings: SideNoteSettings;
    comments: Comment[] = [];

    async onload() {
        await this.loadPluginData(); // Load all data
        this.commentManager = new CommentManager(this.comments);

        this.addSettingTab(new SideNoteSettingTab(this.app, this));

        this.registerView("sidenote-view", (leaf) => new SideNoteView(leaf, this));

        this.addCommand({
            id: "open-comment-view",
            name: "Open comment view",
            callback: () => {
                void switchToSideNoteView(this.app);
            },
        });

        this.addCommand({
            id: "add-comment-to-selection",
            name: "Add comment to selection",
            callback: () => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    const editor = activeView.editor;
                    const selection = editor.getSelection();
                    const cursorStart = editor.getCursor("from");
                    const cursorEnd = editor.getCursor("to");
                    const filePath = activeView.file?.path;

                    if (selection && filePath) {
                        new CommentModal(this.app, (comment) => {
                            const newComment: Comment = {
                                filePath: filePath,
                                startLine: cursorStart.line,
                                startChar: cursorStart.ch,
                                endLine: cursorEnd.line,
                                endChar: cursorEnd.ch,
                                selectedText: selection,
                                comment: comment,
                                timestamp: Date.now(),
                            };
                            this.addComment(newComment);
                        }).open();
                    } else {
                        new Notice("No text selected or file not found.");
                    }
                } else {
                    new Notice("No active Markdown view found.");
                }
            },
        });

        // エディタの右クリックメニューに項目を追加
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                // テキストが選択されている場合のみメニュー項目を追加
                if (editor.somethingSelected()) {
                    menu.addItem((item) => {
                        item.setTitle("Add comment to selection")
                            .setIcon("message-square") // アイコンはLucide Iconsから選べます
                            .onClick(() => {
                                const selection = editor.getSelection();
                                const cursorStart = editor.getCursor("from");
                                const cursorEnd = editor.getCursor("to");
                                const filePath = view.file?.path;

                                if (selection && filePath) {
                                    new CommentModal(this.app, (comment) => {
                                        const newComment: Comment = {
                                            filePath: filePath,
                                            startLine: cursorStart.line,
                                            startChar: cursorStart.ch,
                                            endLine: cursorEnd.line,
                                            endChar: cursorEnd.ch,
                                            selectedText: selection,
                                            comment: comment,
                                            timestamp: Date.now(),
                                        };
                                        this.addComment(newComment);
                                    }).open();
                                } else {
                                    new Notice("No text selected or file not found.");
                                }
                            });
                    });
                }
            })
        );

        // リボンアイコンを追加
        this.addRibbonIcon("message-square", "Open comment view", () => {
            void switchToSideNoteView(this.app);
        });
    }

    async onCommentsChanged(message: string) {
        await this.saveData();
        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
            if (leaf.view instanceof SideNoteView) {
                leaf.view.renderComments();
            }
        });
        new Notice(message);
    }

    addComment(newComment: Comment) {
        this.commentManager.addComment(newComment);
        void this.onCommentsChanged("Comment added!");
    }

    editComment(timestamp: number, newCommentText: string) {
        this.commentManager.editComment(timestamp, newCommentText);
        void this.onCommentsChanged("Comment updated!");
    }

    deleteComment(timestamp: number) {
        this.commentManager.deleteComment(timestamp);
        void this.onCommentsChanged("Comment deleted!");
    }

    async loadPluginData() {
        const loadedData: PluginData = Object.assign({}, { comments: [] }, await this.loadData());
        this.settings = {
            commentSortOrder: loadedData.commentSortOrder || DEFAULT_SETTINGS.commentSortOrder,
        };
        this.comments = loadedData.comments || [];
    }

    async saveData() {
        const dataToSave: PluginData = {
            ...this.settings,
            comments: this.comments,
        };
        await super.saveData(dataToSave);
    }
}

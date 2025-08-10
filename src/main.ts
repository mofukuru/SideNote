import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, App, MarkdownView, Notice, ViewStateResult, Plugin, Modal, Setting, PluginSettingTab } from "obsidian";
import { Comment, CommentManager } from "./commentManager";

interface CustomViewState extends Record<string, unknown> {
    filePath: string | null;
}

interface MyPluginSettings {
    commentSortOrder: "timestamp" | "position";
    enableScrollTracking: boolean;
}

// Define a new interface for the entire plugin data
interface PluginData extends MyPluginSettings {
    comments: Comment[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    commentSortOrder: "timestamp",
    enableScrollTracking: false,
};

class CustomView extends ItemView {
    private file: TFile | null = null;
    private plugin: MyPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin, file: TFile | null = null) {
        super(leaf);
        this.plugin = plugin;
        this.file = file;
    }

    getViewType() {
        return "custom-view";
    }

    getDisplayText() {
        return "Custom View";
    }

    async onOpen() {
        this.renderComments();
    }

    async setState(state: CustomViewState, result: ViewStateResult): Promise<void> {
        if (state.filePath) {
            this.file = this.app.vault.getAbstractFileByPath(state.filePath) as TFile;
            this.renderComments(); // ファイルが変更されたらコメントを再レンダリング
        }
        await super.setState(state, result);
    }

    public renderComments() { // Made public for settings tab to re-render
        this.containerEl.empty();
        this.containerEl.addClass("sidenote-comment-view");
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
                commentsForFile.forEach((comment) => {
                    const commentEl = this.containerEl.createDiv("comment-item");
                    commentEl.createEl("h4", { text: `Selected: ${comment.selectedText}`, cls: "selected-text-display" });
                    commentEl.createEl("small", { text: new Date(comment.timestamp).toLocaleString(), cls: "timestamp-display" });
                    commentEl.createEl("p", { text: comment.comment, cls: "comment-content" });

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
                            const newLeaf = this.app.workspace.getLeaf(true);
                            await newLeaf.openFile(this.app.vault.getAbstractFileByPath(comment.filePath) as TFile);
                            targetLeaf = newLeaf;
                        }

                        if (targetLeaf && targetLeaf.view instanceof MarkdownView) {
                            this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                            const editor = targetLeaf.view.editor;

                            // Set selection
                            editor.setSelection(
                                { line: comment.startLine, ch: comment.startChar },
                                { line: comment.endLine, ch: comment.endChar }
                            );

                            // If scroll tracking is enabled, scroll to the selection
                            if (this.plugin.settings.enableScrollTracking && this.plugin.settings.commentSortOrder === 'position') {
                                editor.scrollIntoView({
                                    from: { line: comment.startLine, ch: 0 },
                                    to: { line: comment.endLine, ch: 0 }
                                }, true);
                            }

                            editor.focus();
                        } else {
                            new Notice("Failed to jump to Markdown view.");
                        }
                    };

                    const editButton = commentEl.createEl("button", { text: "Edit", cls: "edit-comment-button" });
                    editButton.onclick = () => {
                        new CommentModal(this.app, (editedComment) => {
                            this.plugin.editComment(comment.timestamp, editedComment);
                        }, comment.comment).open();
                    };

                    const deleteButton = commentEl.createEl("button", { text: "Delete", cls: "delete-comment-button" });
                    deleteButton.onclick = () => {
                        this.plugin.deleteComment(comment.timestamp);
                    };
                    commentEl.createEl("hr");
                });
            } else {
                this.containerEl.createDiv().setText("No comments for this file.");
            }
        } else {
            this.containerEl.createDiv().setText("No file selected.");
        }
    }

    getState(): CustomViewState {
        return {
            filePath: this.file ? this.file.path : null,
        };
    }

    onunload() {
        this.app.workspace.detachLeavesOfType("custom-view");
    }
}

// ビューを切り替える関数
async function switchToCustomView(app: App) {
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
            type: "custom-view",
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
        contentEl.createEl("h2", { text: this.initialComment ? "Edit Comment" : "Add Comment" });

        // contentEl.createEl("label", { text: "Comment:" });
        const input = contentEl.createEl("textarea", { cls: "comment-input" });
        input.rows = 5;
        input.value = this.initialComment;

        const button = contentEl.createEl("button", { text: this.initialComment ? "Save" : "Add" });
        button.onclick = () => {
            this.comment = input.value;
            this.onSubmit(this.comment);
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "SideNote Settings" });

        new Setting(containerEl)
            .setName("Comment Sort Order")
            .setDesc("Choose how comments are sorted in the custom view.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("timestamp", "By Timestamp")
                    .addOption("position", "By Position in File")
                    .setValue(this.plugin.settings.commentSortOrder)
                    .onChange(async (value: "timestamp" | "position") => {
                        this.plugin.settings.commentSortOrder = value;
                        await this.plugin.saveData(); // Save all plugin data
                        // Re-render the custom view if it's open to apply the new sort order
                        this.app.workspace.getLeavesOfType("custom-view").forEach(leaf => {
                            if (leaf.view instanceof CustomView) {
                                leaf.view.renderComments();
                            }
                        });
                    })
            );

        new Setting(containerEl)
            .setName('Enable scroll tracking')
            .setDesc('Automatically scroll the Markdown editor to the corresponding position when a comment is selected (only for position sort order).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableScrollTracking)
                .onChange(async (value) => {
                    this.plugin.settings.enableScrollTracking = value;
                    await this.plugin.saveData();
                }));
    }
}

// プラグインのアクティベーション処理
export default class MyPlugin extends Plugin {
    commentManager: CommentManager;
    settings: MyPluginSettings;
    comments: Comment[] = [];

    async onload() {
        await this.loadPluginData(); // Load all data
        this.commentManager = new CommentManager(this.comments);

        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerView("custom-view", (leaf) => new CustomView(leaf, this));

        this.addCommand({
            id: "switch-to-custom-view",
            name: "Switch to Custom View",
            callback: () => {
                switchToCustomView(this.app);
            },
        });

        this.addCommand({
            id: "add-comment-to-selection",
            name: "Add Comment to Selection",
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
                        item.setTitle("Add Comment to Selection")
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
        this.addRibbonIcon("message-square", "Open Comment View", () => {
            switchToCustomView(this.app);
        });
    }

    async onCommentsChanged(message: string) {
        await this.saveData();
        this.app.workspace.getLeavesOfType("custom-view").forEach(leaf => {
            if (leaf.view instanceof CustomView) {
                leaf.view.renderComments();
            }
        });
        new Notice(message);
    }

    addComment(newComment: Comment) {
        this.commentManager.addComment(newComment);
        this.onCommentsChanged("Comment added!");
    }

    editComment(timestamp: number, newCommentText: string) {
        this.commentManager.editComment(timestamp, newCommentText);
        this.onCommentsChanged("Comment updated!");
    }

    deleteComment(timestamp: number) {
        this.commentManager.deleteComment(timestamp);
        this.onCommentsChanged("Comment deleted!");
    }

    async loadPluginData() {
        const loadedData: PluginData = Object.assign({}, { comments: [] }, await this.loadData());
        this.settings = {
            commentSortOrder: loadedData.commentSortOrder || DEFAULT_SETTINGS.commentSortOrder,
            enableScrollTracking: loadedData.enableScrollTracking || DEFAULT_SETTINGS.enableScrollTracking,
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

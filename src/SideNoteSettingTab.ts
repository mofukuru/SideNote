import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SideNote from "./main";
import { SideNoteView } from "./SideNoteView";

export class SideNoteSettingTab extends PluginSettingTab {
    plugin: SideNote;

    constructor(app: App, plugin: SideNote) {
        super(app, plugin);
        this.plugin = plugin;
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
                        await this.plugin.saveData();
                        this.rerenderViews();
                    })
            );

        new Setting(containerEl)
            .setName("Show highlights in editor")
            .setDesc("Display highlights for commented text in the editor. After changing this setting, please restart Obsidian to see the effect.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showHighlights)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.showHighlights = value;
                        await this.plugin.saveData();
                        this.plugin.refreshEditorDecorations();
                    })
            );

        new Setting(containerEl)
            .setName("Show resolved comments")
            .setDesc("Display resolved comments in the sidebar (shown dimmed). Uncheck to hide resolved comments entirely.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showResolvedComments)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.showResolvedComments = value;
                        await this.plugin.saveData();
                        this.rerenderViews();
                    })
            );

        new Setting(containerEl)
            .setName("Highlight color")
            .setDesc("Choose the color for highlighted comments in the editor")
            .addColorPicker((colorPicker) =>
                colorPicker
                    .setValue(this.plugin.settings.highlightColor || "#FFC800")
                    .onChange(async (value: string) => {
                        this.plugin.settings.highlightColor = value;
                        await this.plugin.saveData();
                        this.plugin.applyHighlightColor();
                    })
            );

        new Setting(containerEl)
            .setName("Highlight opacity")
            .setDesc("Set the transparency of the highlight (0 = transparent, 1 = opaque)")
            .addSlider((slider) =>
                slider
                    .setLimits(0, 1, 0.1)
                    .setValue(this.plugin.settings.highlightOpacity || 0.2)
                    .onChange(async (value: number) => {
                        this.plugin.settings.highlightOpacity = value;
                        await this.plugin.saveData();
                        this.plugin.applyHighlightColor();
                    })
            );

        new Setting(containerEl)
            .setName("Highlight style")
            .setDesc("Choose how commented text is marked in the editor")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("both", "Underline + Background")
                    .addOption("background", "Background only")
                    .addOption("underline", "Underline only")
                    .addOption("dashed", "Dashed underline only")
                    .addOption("wavy", "Wavy underline only")
                    .setValue(this.plugin.settings.highlightStyle || "both")
                    .onChange(async (value: string) => {
                        this.plugin.settings.highlightStyle = value as typeof this.plugin.settings.highlightStyle;
                        await this.plugin.saveData();
                        this.plugin.applyHighlightColor();
                    })
            );

        new Setting(containerEl)
            .setName("Markdown comments folder")
            .setDesc("Folder (relative to vault) where sidenote markdown backup files are stored")
            .addText((text) =>
                text
                    .setPlaceholder("side-note-comments")
                    .setValue(this.plugin.settings.markdownFolder || "")
                    .onChange(async (value) => {
                        this.plugin.settings.markdownFolder = value.trim() || "side-note-comments";
                        await this.plugin.saveData();
                    })
            );

        new Setting(containerEl)
            .setName("Create Markdown Backup")
            .setDesc("Export all comments to markdown files in the configured folder")
            .addButton((button) =>
                button
                    .setButtonText("Create Backup")
                    .onClick(async () => {
                        await this.plugin.migrateInlineCommentsToMarkdown();
                        new Notice("Markdown backup created successfully!");
                    })
            );

        const orphanedCount = this.plugin.commentManager.getOrphanedCommentCount();

        new Setting(containerEl)
            .setName("Orphaned comments")
            .setDesc(`There are ${orphanedCount} orphaned comment(s). These are comments whose original text was deleted.`);

        new Setting(containerEl)
            .addButton((button) =>
                button
                    .setButtonText(`Delete ${orphanedCount} orphaned comment(s)`)
                    .setWarning()
                    .onClick(async () => {
                        const deleted = this.plugin.commentManager.deleteOrphanedComments();
                        await this.plugin.saveData();
                        this.rerenderViews();
                        new Notice(`Deleted ${deleted} orphaned comment(s)!`);
                        this.display();
                    })
                    .setDisabled(orphanedCount === 0)
            );
    }

    private rerenderViews() {
        this.app.workspace.getLeavesOfType("sidenote-view").forEach(leaf => {
            if (leaf.view instanceof SideNoteView) {
                leaf.view.renderComments();
            }
        });
    }
}

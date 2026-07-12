import { App, Modal } from "obsidian";

export class ConfirmDiscardModal extends Modal {
    private readonly onDiscard: () => void;
    private readonly onKeepEditing?: () => void;
    private discarded = false;

    constructor(app: App, onDiscard: () => void, onKeepEditing?: () => void) {
        super(app);
        this.onDiscard = onDiscard;
        this.onKeepEditing = onKeepEditing;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("sidenote-confirm-modal");

        contentEl.createEl("h2", { text: "Discard changes" });
        contentEl.createEl("p", { text: "You have unsaved changes. Discard them?" });

        const footer = contentEl.createDiv("sidenote-modal-footer");

        const cancelButton = footer.createEl("button", {
            text: "Keep editing",
            cls: "sidenote-modal-cancel-btn"
        });
        cancelButton.onclick = () => this.close();

        const discardButton = footer.createEl("button", {
            text: "Discard",
            cls: "mod-warning sidenote-modal-submit-btn"
        });
        discardButton.onclick = () => {
            this.discarded = true;
            this.onDiscard();
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
        if (!this.discarded) {
            this.onKeepEditing?.();
        }
    }
}

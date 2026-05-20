import { App, Modal } from "obsidian";

export class ConfirmDeleteModal extends Modal {
    private readonly onConfirm: () => void;

    constructor(app: App, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("sidenote-confirm-modal");

        contentEl.createEl("h2", { text: "Delete comment" });
        contentEl.createEl("p", { text: "Are you sure you want to delete this comment? This action cannot be undone." });

        const footer = contentEl.createDiv("sidenote-modal-footer");

        const cancelButton = footer.createEl("button", {
            text: "Cancel",
            cls: "sidenote-modal-cancel-btn"
        });
        cancelButton.onclick = () => this.close();

        const deleteButton = footer.createEl("button", {
            text: "Delete",
            cls: "mod-warning sidenote-modal-submit-btn"
        });
        deleteButton.onclick = () => {
            this.onConfirm();
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

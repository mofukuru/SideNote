import { App, Modal, Notice } from "obsidian";
import { bindModalActionHandlers } from "./core/modalActionBindings";
import { SubmitExecutionGuard } from "./core/submitExecutionGuard";

export class CommentModal extends Modal {
    comment: string = "";
    private readonly onSubmit: (comment: string) => void | Promise<void>;
    private readonly initialComment: string;
    private textareaEl: HTMLTextAreaElement | null = null;
    private submitButtonEl: HTMLButtonElement | null = null;
    private cancelButtonEl: HTMLButtonElement | null = null;
    private readonly submitGuard = new SubmitExecutionGuard(400);

    constructor(app: App, onSubmit: (comment: string) => void | Promise<void>, initialComment = '') {
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
        input.classList.add("sidenote-textarea");
        this.textareaEl = input;

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void this.submitComment();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (!this.submitGuard.isSubmitting()) {
                    this.close();
                }
            }
        });

        const footer = contentEl.createDiv("sidenote-modal-footer");

        const cancelButton = footer.createEl("button", {
            text: "Cancel",
            cls: "sidenote-modal-cancel-btn"
        });
        this.cancelButtonEl = cancelButton;

        const submitButton = footer.createEl("button", {
            text: this.initialComment ? "Save" : "Add",
            cls: "mod-cta sidenote-modal-submit-btn"
        });
        submitButton.setAttribute('type', 'button');
        this.submitButtonEl = submitButton;

        bindModalActionHandlers({
            submitButton,
            cancelButton,
            submitGuard: this.submitGuard,
            onSubmitTriggered: async () => {
                if (this.textareaEl) this.textareaEl.blur();
                await this.submitComment();
            },
            onCancelTriggered: () => this.close(),
        });

        // Focus after render; scroll into view on mobile
        setTimeout(() => {
            input.focus();
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);

        this.modalEl.addEventListener('click', (e: MouseEvent) => {
            if (e.target === this.modalEl) this.close();
        });

        document.body.style.overflow = 'hidden';
    }

    async submitComment() {
        if (!this.textareaEl) {
            new Notice("Error: Comment field is empty");
            return;
        }
        if (!this.submitGuard.tryStartSubmit()) return;

        if (this.submitButtonEl) this.submitButtonEl.disabled = true;
        if (this.cancelButtonEl) this.cancelButtonEl.disabled = true;

        this.comment = this.textareaEl.value;
        try {
            await this.onSubmit(this.comment);
            this.close();
        } catch (error) {
            new Notice("Error: Failed to save comment");
            console.error("Error in onSubmit:", error);
        } finally {
            this.submitGuard.finishSubmit();
            if (this.submitButtonEl) this.submitButtonEl.disabled = false;
            if (this.cancelButtonEl) this.cancelButtonEl.disabled = false;
        }
    }

    onClose() {
        this.contentEl.empty();
        this.textareaEl = null;
        this.submitButtonEl = null;
        this.cancelButtonEl = null;
        this.submitGuard.reset();
        document.body.style.overflow = '';
    }
}

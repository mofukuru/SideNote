import { App, Notice, WorkspaceLeaf } from "obsidian";

export async function generateHash(text: string): Promise<string> {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        try {
            const nodeCrypto = require('crypto');
            return nodeCrypto.createHash('sha256').update(text).digest('hex');
        } catch {
            new Notice("Warning: Could not generate proper hash, using fallback");
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(16);
        }
    }
}

export function generateCommentId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    try {
        const nodeCrypto = require('crypto');
        if (typeof nodeCrypto.randomUUID === "function") {
            return nodeCrypto.randomUUID();
        }
    } catch {
        // fall through to timestamp-based fallback
    }
    return `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function switchToSideNoteView(app: App): Promise<void> {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("No active Markdown file found.");
        return;
    }

    let leaf: WorkspaceLeaf | null = null;
    try {
        leaf = app.workspace.getLeaf('split', 'vertical');
    } catch (error) {
        new Notice("Failed to create a new split view for comments.");
        console.error("Error creating split leaf:", error);
        return;
    }

    if (leaf) {
        await leaf.setViewState({
            type: "sidenote-view",
            state: { filePath: activeFile.path },
            active: true,
        });
        void app.workspace.revealLeaf(leaf);
    } else {
        new Notice("Failed to create or find a leaf for the comment view.");
    }
}

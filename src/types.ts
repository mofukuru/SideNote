import type { App } from "obsidian";
import type { Comment, CommentManager } from "./commentManager";

export interface CustomViewState extends Record<string, unknown> {
    filePath: string | null;
}

export interface SideNoteSettings {
    commentSortOrder: "timestamp" | "position";
    showHighlights: boolean;
    markdownFolder: string;
    highlightColor: string;
    highlightOpacity: number;
    showResolvedComments: boolean;
}

export interface PluginData extends SideNoteSettings {
    comments: Comment[];
}

// Minimal interface describing what external modules need from the SideNote plugin.
// Avoids circular imports: SideNoteView / highlightPlugin depend on this, not on main.ts.
export interface SideNotePlugin {
    readonly app: App;
    readonly settings: SideNoteSettings;
    readonly commentManager: CommentManager;
    editComment(id: string, text: string): Promise<void>;
    deleteComment(id: string): void;
    resolveComment(id: string): Promise<void>;
    unresolveComment(id: string): Promise<void>;
    activateViewAndHighlightComment(commentId: string): Promise<void>;
    saveData(): Promise<void>;
    refreshEditorDecorations(): void;
    applyHighlightColor(): void;
    migrateInlineCommentsToMarkdown(): Promise<void>;
}

export const DEFAULT_SETTINGS: SideNoteSettings = {
    commentSortOrder: "position",
    showHighlights: true,
    markdownFolder: "side-note-comments",
    highlightColor: "#FFC800",
    highlightOpacity: 0.2,
    showResolvedComments: false,
};

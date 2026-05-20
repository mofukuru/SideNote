import { MarkdownView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import type { SideNotePlugin } from "./types";

export interface EditorWithCM {
    cm?: EditorView;
}

export const forceUpdateEffect = StateEffect.define<null>();

export function createHighlightPlugin(plugin: SideNotePlugin) {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;
        view: EditorView;
        boundHandleClick: (e: MouseEvent) => void;
        private positions: Map<string, { from: number; to: number; selectedText: string }> = new Map();
        private filePath: string | null = null;

        constructor(view: EditorView) {
            this.view = view;
            this.boundHandleClick = this.handleClick.bind(this);
            this.view.dom.addEventListener('click', this.boundHandleClick);
            this.filePath = this.resolveFilePath(view);
            this.initPositions(view);
            this.decorations = this.buildDecorations(view);
        }

        destroy() {
            this.view.dom.removeEventListener('click', this.boundHandleClick);
        }

        handleClick(event: MouseEvent) {
            const highlight = (event.target as HTMLElement).closest('.sidenote-highlight');
            if (!highlight) return;
            const commentId = highlight.getAttribute('data-comment-id');
            if (commentId) plugin.activateViewAndHighlightComment(commentId);
        }

        private resolveFilePath(view: EditorView): string | null {
            let filePath: string | null = null;
            plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
                if (leaf.view instanceof MarkdownView && leaf.view.file) {
                    const cm = (leaf.view.editor as unknown as EditorWithCM).cm;
                    if (cm === view) filePath = leaf.view.file.path;
                }
            });
            return filePath;
        }

        private initPositions(view: EditorView) {
            this.positions = new Map();
            if (!this.filePath || !plugin.settings.showHighlights) return;
            const doc = view.state.doc;
            for (const comment of plugin.commentManager.getCommentsForFile(this.filePath)) {
                if (comment.resolved || comment.isOrphaned) continue;
                try {
                    const sl = doc.line(comment.startLine + 1);
                    const from = sl.from + comment.startChar;
                    const el = doc.line(comment.endLine + 1);
                    const to = el.from + comment.endChar;
                    if (from >= 0 && to <= doc.length && from < to) {
                        // Verify the text at these coordinates matches what was commented on.
                        // If it doesn't, the stored coordinates are stale — skip rather than
                        // placing a highlight on the wrong text.
                        const textAtCoords = doc.sliceString(from, to);
                        if (textAtCoords === comment.selectedText) {
                            this.positions.set(comment.id, { from, to, selectedText: comment.selectedText });
                        }
                    }
                } catch { /* line out of range */ }
            }
        }

        update(update: ViewUpdate) {
            const hasForceUpdate = update.transactions.some(tr =>
                tr.effects.some(e => e.is(forceUpdateEffect))
            );

            if (hasForceUpdate) {
                this.filePath = this.resolveFilePath(update.view);
                this.initPositions(update.view);
            } else if (update.docChanged) {
                const newPositions = new Map<string, { from: number; to: number; selectedText: string }>();
                const doc = update.view.state.doc;

                for (const [id, { from, to, selectedText }] of this.positions) {
                    const newFrom = update.changes.mapPos(from, -1);
                    const newTo   = update.changes.mapPos(to,   1);

                    if (newFrom < newTo) {
                        // Verify the text content is still correct after the change.
                        // This catches partial edits within the highlighted range.
                        const currentText = doc.sliceString(newFrom, newTo);
                        if (currentText === selectedText) {
                            newPositions.set(id, { from: newFrom, to: newTo, selectedText });
                            // Sync to comment manager for sidebar navigation accuracy.
                            // Do NOT sync when orphaning — we want to preserve the last-known-good
                            // coordinates for undo recovery.
                            const comment = plugin.commentManager.getComments().find(c => c.id === id);
                            if (comment) {
                                const sl = doc.lineAt(newFrom);
                                const el = doc.lineAt(newTo);
                                comment.startLine = sl.number - 1;
                                comment.startChar  = newFrom - sl.from;
                                comment.endLine   = el.number - 1;
                                comment.endChar   = newTo   - el.from;
                            }
                        } else {
                            // Text content changed within range → orphan.
                            // Keep stored coords unchanged so undo can recover.
                            const comment = plugin.commentManager.getComments().find(c => c.id === id);
                            if (comment) comment.isOrphaned = true;
                        }
                    } else {
                        // Range collapsed (text fully deleted) → orphan.
                        const comment = plugin.commentManager.getComments().find(c => c.id === id);
                        if (comment) comment.isOrphaned = true;
                    }
                }

                this.positions = newPositions;
            }

            this.decorations = this.buildDecorations(update.view);
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            if (!plugin.settings.showHighlights || !this.filePath) return builder.finish();

            const doc = view.state.doc;
            const decorationsArray: Array<{ from: number; to: number; decoration: Decoration }> = [];

            for (const [id, { from, to }] of this.positions) {
                if (from >= 0 && to <= doc.length && from < to) {
                    decorationsArray.push({
                        from, to,
                        decoration: Decoration.mark({
                            class: 'sidenote-highlight',
                            attributes: { 'data-comment-id': id },
                        }),
                    });
                }
            }

            for (const comment of plugin.commentManager.getCommentsForFile(this.filePath)) {
                if (comment.resolved || !comment.isOrphaned) continue;
                try {
                    const line = doc.line(comment.startLine + 1);
                    const from = line.from + comment.startChar;
                    const to   = Math.min(from + 1, line.to);
                    if (from >= 0 && to <= doc.length && from < to) {
                        decorationsArray.push({
                            from, to,
                            decoration: Decoration.mark({
                                class: 'sidenote-highlight orphaned',
                                attributes: { 'data-comment-id': comment.id },
                            }),
                        });
                    }
                } catch { /* line doesn't exist */ }
            }

            decorationsArray.sort((a, b) => a.from - b.from);
            for (const { from, to, decoration } of decorationsArray) {
                builder.add(from, to, decoration);
            }
            return builder.finish();
        }
    }, {
        decorations: (v: { decorations: DecorationSet }) => v.decorations,
    });
}

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
        // Tracks the current document position of orphaned comments so the red dot
        // follows edits instead of staying frozen at the moment of orphaning.
        private orphanedAt: Map<string, number> = new Map();
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
            this.positions   = new Map();
            this.orphanedAt  = new Map();
            if (!this.filePath || !plugin.settings.showHighlights) return;
            const doc = view.state.doc;
            for (const comment of plugin.commentManager.getCommentsForFile(this.filePath)) {
                if (comment.resolved || comment.isNoteComment) continue;

                if (comment.isOrphaned) {
                    // Register a single-point marker so the red dot can be OT-tracked.
                    try {
                        let pos: number;
                        if (comment.startOffset !== undefined && comment.startOffset >= 0 && comment.startOffset < doc.length) {
                            pos = comment.startOffset;
                        } else {
                            const sl = doc.line(comment.startLine + 1);
                            pos = sl.from + comment.startChar;
                        }
                        if (pos >= 0 && pos <= doc.length) this.orphanedAt.set(comment.id, pos);
                    } catch { /* line out of range */ }
                    continue;
                }

                try {
                    // Prefer stored absolute offsets (set by a previous OT session).
                    // Fall back to line/char when offsets are missing or out of range.
                    let from: number, to: number;
                    if (
                        comment.startOffset !== undefined &&
                        comment.endOffset !== undefined &&
                        comment.startOffset >= 0 &&
                        comment.endOffset <= doc.length &&
                        comment.startOffset < comment.endOffset
                    ) {
                        from = comment.startOffset;
                        to   = comment.endOffset;
                    } else {
                        const sl = doc.line(comment.startLine + 1);
                        from = sl.from + comment.startChar;
                        const el = doc.line(comment.endLine + 1);
                        to   = el.from + comment.endChar;
                    }

                    if (from >= 0 && to <= doc.length && from < to) {
                        const textAtCoords = doc.sliceString(from, to);
                        if (textAtCoords === comment.selectedText) {
                            this.positions.set(comment.id, { from, to, selectedText: comment.selectedText });
                            // Always persist the verified offsets so the fast path works next session.
                            comment.startOffset = from;
                            comment.endOffset   = to;
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
                const newPositions  = new Map<string, { from: number; to: number; selectedText: string }>();
                const newOrphanedAt = new Map<string, number>();
                const doc = update.view.state.doc;

                // --- Active (yellow) highlights ---
                for (const [id, { from, to, selectedText }] of this.positions) {
                    // assoc=1 for from: insertion AT from maps to the right of inserted text,
                    // keeping the highlight start anchored to the original selected text.
                    // assoc=-1 for to: insertion AT to stays left of inserted text,
                    // keeping the highlight end anchored without absorbing appended text.
                    const newFrom = update.changes.mapPos(from,  1);
                    const newTo   = update.changes.mapPos(to,   -1);

                    if (newFrom < newTo && doc.sliceString(newFrom, newTo) === selectedText) {
                        newPositions.set(id, { from: newFrom, to: newTo, selectedText });
                        const comment = plugin.commentManager.getComments().find(c => c.id === id);
                        if (comment) {
                            const sl = doc.lineAt(newFrom);
                            const el = doc.lineAt(newTo);
                            comment.startLine   = sl.number - 1;
                            comment.startChar   = newFrom - sl.from;
                            comment.endLine     = el.number - 1;
                            comment.endChar     = newTo   - el.from;
                            comment.startOffset = newFrom;
                            comment.endOffset   = newTo;
                        }
                    } else {
                        // Text changed or collapsed → orphan. Track the nearest surviving position
                        // so the red dot follows subsequent edits instead of staying frozen.
                        const orphanPos = newFrom <= doc.length ? newFrom : doc.length;
                        newOrphanedAt.set(id, orphanPos);
                        const comment = plugin.commentManager.getComments().find(c => c.id === id);
                        if (comment) {
                            comment.isOrphaned  = true;
                            comment.startOffset = orphanPos;
                            comment.endOffset   = orphanPos;
                            const sl = doc.lineAt(orphanPos);
                            comment.startLine = sl.number - 1;
                            comment.startChar = orphanPos - sl.from;
                        }
                    }
                }

                // --- Orphaned (red) highlights: keep tracking & check for undo recovery ---
                for (const [id, pos] of this.orphanedAt) {
                    const newPos = update.changes.mapPos(pos, -1);
                    const comment = plugin.commentManager.getComments().find(c => c.id === id);
                    if (!comment) continue;

                    // Undo recovery: check if selectedText reappears at the tracked position.
                    const recoveryEnd = newPos + comment.selectedText.length;
                    if (
                        recoveryEnd <= doc.length &&
                        doc.sliceString(newPos, recoveryEnd) === comment.selectedText
                    ) {
                        comment.isOrphaned  = false;
                        comment.startOffset = newPos;
                        comment.endOffset   = recoveryEnd;
                        const sl = doc.lineAt(newPos);
                        const el = doc.lineAt(recoveryEnd);
                        comment.startLine = sl.number - 1;
                        comment.startChar = newPos      - sl.from;
                        comment.endLine   = el.number - 1;
                        comment.endChar   = recoveryEnd - el.from;
                        newPositions.set(id, { from: newPos, to: recoveryEnd, selectedText: comment.selectedText });
                    } else {
                        newOrphanedAt.set(id, newPos);
                        comment.startOffset = newPos;
                        comment.endOffset   = newPos;
                        const sl = doc.lineAt(newPos);
                        comment.startLine = sl.number - 1;
                        comment.startChar = newPos - sl.from;
                    }
                }

                this.positions  = newPositions;
                this.orphanedAt = newOrphanedAt;
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
                if (comment.resolved || comment.isNoteComment || !comment.isOrphaned) continue;
                // Prefer the OT-tracked position (follows edits); fall back to stored line/char.
                const trackedPos = this.orphanedAt.get(comment.id);
                try {
                    const from = trackedPos !== undefined
                        ? trackedPos
                        : doc.line(comment.startLine + 1).from + comment.startChar;
                    const to = Math.min(from + 1, doc.length);
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

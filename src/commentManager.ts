export interface Comment {
    id: string;
    filePath: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    // Absolute character offsets into the file content (Overleaf-style OT tracking).
    // Set by the CM6 highlight plugin via ChangeSet.mapPos(); used as the fast-path
    // for position recovery so re-searching the whole file is rarely needed.
    startOffset?: number;
    endOffset?: number;
    selectedText: string;
    selectedTextHash: string;
    comment: string;
    timestamp: number;
    isOrphaned?: boolean;
    isNoteComment?: boolean;
    commentPath?: string;
    resolved?: boolean;
    resolvedAt?: number | null;
}

export class CommentManager {
    private comments: Comment[];
    private readonly MIN_TEXT_LENGTH = 3;

    constructor(comments: Comment[]) {
        this.comments = comments;
    }

    private generateHash(text: string): string {
        try {
            const nodeCrypto = require('crypto');
            return nodeCrypto.createHash('sha256').update(text).digest('hex');
        } catch {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(16);
        }
    }

    getCommentsForFile(filePath: string): Comment[] {
        return this.comments.filter(c => c.filePath === filePath);
    }

    addComment(newComment: Comment) {
        if (!newComment.selectedTextHash) {
            newComment.selectedTextHash = this.generateHash(newComment.selectedText);
        }
        this.comments.push(newComment);
    }

    editComment(id: string, newCommentText: string) {
        const comment = this.comments.find(c => c.id === id);
        if (comment) {
            comment.comment = newCommentText;
        }
    }

    deleteComment(id: string) {
        const index = this.comments.findIndex(c => c.id === id);
        if (index > -1) {
            this.comments.splice(index, 1);
        }
    }

    resolveComment(id: string) {
        const comment = this.comments.find(c => c.id === id);
        if (comment) {
            comment.resolved = true;
            comment.resolvedAt = Date.now();
        }
    }

    unresolveComment(id: string) {
        const comment = this.comments.find(c => c.id === id);
        if (comment) {
            comment.resolved = false;
            comment.resolvedAt = null;
        }
    }

    deleteOrphanedComments(): number {
        const before = this.comments.length;
        // Backward splice preserves the shared array reference required by the plugin
        for (let i = this.comments.length - 1; i >= 0; i--) {
            if (this.comments[i].isOrphaned) {
                this.comments.splice(i, 1);
            }
        }
        return before - this.comments.length;
    }

    getOrphanedComments(): Comment[] {
        return this.comments.filter(c => c.isOrphaned);
    }

    getOrphanedCommentCount(): number {
        return this.getOrphanedComments().length;
    }

    renameFile(oldPath: string, newPath: string) {
        this.comments.forEach(c => {
            if (c.filePath === oldPath) {
                c.filePath = newPath;
            }
        });
    }

    updateComments(newComments: Comment[]) {
        this.comments = newComments;
    }

    getComments(): Comment[] {
        return this.comments;
    }

    // Weight line distance more heavily than char distance so nearby lines rank first
    private calculateDistance(line1: number, char1: number, line2: number, char2: number): number {
        return Math.abs(line1 - line2) * 1000 + Math.abs(char1 - char2);
    }

    private findTextPositionWithHashVerification(
        fileContent: string,
        selectedText: string,
        selectedTextHash: string,
        hintStartLine: number,
        hintStartChar: number,
        hintEndLine: number,
    ): { line: number; startChar: number; endChar: number } | null {
        if (!selectedText || selectedText.length < this.MIN_TEXT_LENGTH) return null;

        const lines = fileContent.split('\n');
        const escapedText = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');

        const startLine = Math.max(0, hintStartLine - 50);
        const endLine = Math.min(lines.length, hintEndLine + 50);

        const candidates: { line: number; startChar: number; endChar: number; distance: number }[] = [];

        for (let lineNum = startLine; lineNum < endLine; lineNum++) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(lines[lineNum])) !== null) {
                const foundText = lines[lineNum].substring(match.index, match.index + selectedText.length);
                if (this.generateHash(foundText) === selectedTextHash) {
                    candidates.push({
                        line: lineNum,
                        startChar: match.index,
                        endChar: match.index + selectedText.length,
                        distance: this.calculateDistance(lineNum, match.index, hintStartLine, hintStartChar),
                    });
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.distance - b.distance);
        const { line, startChar, endChar } = candidates[0];
        return { line, startChar, endChar };
    }

    private findTextByHashOptimized(
        fileContent: string,
        selectedTextHash: string,
        originalTextLength: number,
        hintStartLine?: number,
        hintStartChar?: number,
    ): { line: number; startChar: number; endChar: number; text: string } | null {
        const lines = fileContent.split('\n');
        const candidates: { line: number; startChar: number; endChar: number; text: string; distance: number }[] = [];

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];

            const lengths = new Set([originalTextLength]);
            const minLen = Math.max(this.MIN_TEXT_LENGTH, Math.floor(originalTextLength * 0.8));
            const maxLen = Math.min(line.length, Math.ceil(originalTextLength * 1.2));
            for (let l = minLen; l <= maxLen; l++) lengths.add(l);

            for (const length of lengths) {
                if (line.length < length) continue;
                for (let startChar = 0; startChar <= line.length - length; startChar++) {
                    const candidate = line.substring(startChar, startChar + length);
                    if (this.generateHash(candidate) === selectedTextHash) {
                        const distance = (hintStartLine !== undefined && hintStartChar !== undefined)
                            ? this.calculateDistance(lineNum, startChar, hintStartLine, hintStartChar)
                            : 0;
                        candidates.push({ line: lineNum, startChar, endChar: startChar + length, text: candidate, distance });
                    }
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.distance - b.distance);
        const { line, startChar, endChar, text } = candidates[0];
        return { line, startChar, endChar, text };
    }

    findTextPosition(
        fileContent: string,
        selectedText: string,
        hintStartLine?: number,
        hintEndLine?: number,
        hintStartChar?: number,
    ): { line: number; startChar: number; endChar: number } | null {
        if (!selectedText || selectedText.length < this.MIN_TEXT_LENGTH) return null;

        const lines = fileContent.split('\n');
        const escapedText = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');

        const searchRange = (startLine: number, endLine: number) => {
            const found: { line: number; startChar: number; endChar: number; distance: number }[] = [];
            for (let lineNum = startLine; lineNum < endLine; lineNum++) {
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(lines[lineNum])) !== null) {
                    const distance = (hintStartLine !== undefined && hintStartChar !== undefined)
                        ? this.calculateDistance(lineNum, match.index, hintStartLine, hintStartChar)
                        : 0;
                    found.push({ line: lineNum, startChar: match.index, endChar: match.index + selectedText.length, distance });
                }
            }
            return found;
        };

        const rangeStart = hintStartLine !== undefined ? Math.max(0, hintStartLine - 10) : 0;
        const rangeEnd = hintEndLine !== undefined ? Math.min(lines.length, hintEndLine + 10) : lines.length;

        let candidates = searchRange(rangeStart, rangeEnd);

        if (candidates.length === 0 && hintStartLine !== undefined) {
            candidates = searchRange(0, lines.length);
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.distance - b.distance);
        const { line, startChar, endChar } = candidates[0];
        return { line, startChar, endChar };
    }

    updateCommentCoordinatesForFile(fileContent: string, filePath: string): void {
        const fileComments = this.comments.filter(c => c.filePath === filePath);
        const lines = fileContent.split('\n');

        for (const comment of fileComments) {
            if (comment.isNoteComment) continue;

            if (comment.isOrphaned) {
                // Fast-path recovery via absolute offset (handles undo when OT tracked the position).
                if (this.textAtOffsetMatches(fileContent, comment)) {
                    this.syncLineCoordsFromOffset(fileContent, comment);
                    comment.isOrphaned = false;
                    continue;
                }
                // Fallback: exact line/char coords (original undo recovery path).
                if (this.textAtCoordsMatches(lines, comment)) {
                    comment.isOrphaned = false;
                }
                continue;
            }

            // Fast-path: absolute offsets set by the CM6 OT tracker are still valid.
            if (this.textAtOffsetMatches(fileContent, comment)) {
                this.syncLineCoordsFromOffset(fileContent, comment);
                comment.isOrphaned = false;
                continue;
            }

            // Slow-path: offset is stale (e.g. external sync) — re-search by hash.
            const newPosition = this.resolveCommentPosition(fileContent, comment);

            if (newPosition) {
                comment.startLine   = newPosition.line;
                comment.startChar   = newPosition.startChar;
                comment.endLine     = newPosition.line;
                comment.endChar     = newPosition.endChar;
                comment.startOffset = this.computeOffset(fileContent, newPosition.line, newPosition.startChar);
                comment.endOffset   = comment.startOffset + comment.selectedText.length;
                comment.isOrphaned  = false;
            } else {
                comment.isOrphaned = true;
            }
        }
    }

    private textAtOffsetMatches(fileContent: string, comment: Comment): boolean {
        if (
            comment.startOffset === undefined ||
            comment.endOffset === undefined ||
            comment.startOffset < 0 ||
            comment.endOffset > fileContent.length ||
            comment.startOffset >= comment.endOffset
        ) return false;
        return fileContent.substring(comment.startOffset, comment.endOffset) === comment.selectedText;
    }

    private offsetToLineChar(fileContent: string, offset: number): { line: number; char: number } {
        const lines = fileContent.split('\n');
        let pos = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineEnd = pos + lines[i].length;
            if (offset <= lineEnd) return { line: i, char: offset - pos };
            pos = lineEnd + 1; // +1 for \n
        }
        const last = lines.length - 1;
        return { line: last, char: lines[last].length };
    }

    private syncLineCoordsFromOffset(fileContent: string, comment: Comment): void {
        const start = this.offsetToLineChar(fileContent, comment.startOffset!);
        const end   = this.offsetToLineChar(fileContent, comment.endOffset!);
        comment.startLine = start.line;
        comment.startChar = start.char;
        comment.endLine   = end.line;
        comment.endChar   = end.char;
    }

    private computeOffset(fileContent: string, line: number, char: number): number {
        const lines = fileContent.split('\n');
        let offset = 0;
        for (let i = 0; i < line && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for \n
        }
        return offset + char;
    }

    private textAtCoordsMatches(lines: string[], comment: Comment): boolean {
        if (comment.startLine < 0 || comment.startLine >= lines.length) return false;
        const line = lines[comment.startLine];
        if (comment.startChar < 0 || comment.endChar > line.length || comment.startChar > comment.endChar) return false;
        return line.slice(comment.startChar, comment.endChar) === comment.selectedText;
    }

    private resolveCommentPosition(
        fileContent: string,
        comment: Comment,
    ): { line: number; startChar: number; endChar: number } | null {
        if (comment.selectedTextHash) {
            // Step 1: verify hash within ±10 lines (handles minor position shifts,
            // e.g. external edits or pastes that moved the text slightly).
            const byHash = this.findTextPositionWithHashVerification(
                fileContent,
                comment.selectedText,
                comment.selectedTextHash,
                comment.startLine,
                comment.startChar,
                comment.endLine,
            );
            if (byHash) return byHash;

            // Do NOT fall back to a full-document hash scan here.
            // findTextByHashOptimized would match any identical text anywhere in the
            // file, causing highlights to drift to unrelated occurrences when the
            // original text is deleted.  The CM6 OT plugin keeps coordinates in sync
            // during editing, so a full-document search is never necessary for normal
            // use; and for external edits the ±10-line search above is sufficient.
            return null;
        }

        // Legacy comments without hash: fall back to regex
        return this.findTextPosition(
            fileContent,
            comment.selectedText,
            comment.startLine,
            comment.endLine,
            comment.startChar,
        );
    }
}

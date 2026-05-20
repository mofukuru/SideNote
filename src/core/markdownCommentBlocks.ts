import type { Comment } from "../commentManager";

type CommentMarkerRef = Pick<Comment, "id" | "timestamp">;
type CommentBlockRef = Pick<Comment, "id" | "timestamp" | "selectedText">;

export function buildMarkdownBlock(excerpt: string, body: string, commentId: string): string {
    const safeExcerpt = excerpt || "(no excerpt)";
    return `## ${safeExcerpt}\n<!-- side-note:${commentId} -->\n${body}\n\n---`;
}

export function resolveExistingMarker(content: string, comment: CommentMarkerRef): string | null {
    const idMarker = `<!-- side-note:${comment.id} -->`;
    if (content.includes(idMarker)) {
        return idMarker;
    }

    const legacyMarker = `<!-- side-note:${comment.timestamp} -->`;
    if (content.includes(legacyMarker)) {
        return legacyMarker;
    }

    return null;
}

const BLOCK_SEP = '\n\n---';

export function replaceMarkdownCommentBlock(content: string, comment: CommentBlockRef, newBody: string): string {
    const marker = resolveExistingMarker(content, comment);
    if (!marker) return content;

    const markerIdx = content.indexOf(marker);
    if (markerIdx === -1) return content;

    const headingIdx = content.lastIndexOf('\n## ', markerIdx);
    const blockStart = headingIdx === -1 ? 0 : headingIdx;

    const sepIdx = content.indexOf(BLOCK_SEP, markerIdx);
    const blockEnd = sepIdx === -1 ? content.length : sepIdx + BLOCK_SEP.length;

    const newBlock = buildMarkdownBlock(comment.selectedText, newBody, comment.id);
    const prefix = blockStart === 0 ? '' : '\n';
    const updated = content.slice(0, blockStart) + prefix + newBlock + content.slice(blockEnd);
    return updated.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function removeMarkdownCommentBlock(content: string, comment: CommentMarkerRef): string {
    const marker = resolveExistingMarker(content, comment);
    if (!marker) return content;

    const markerIdx = content.indexOf(marker);
    if (markerIdx === -1) return content;

    const headingIdx = content.lastIndexOf('\n## ', markerIdx);
    const blockStart = headingIdx === -1 ? 0 : headingIdx;

    const sepIdx = content.indexOf(BLOCK_SEP, markerIdx);
    const blockEnd = sepIdx === -1 ? content.length : sepIdx + BLOCK_SEP.length;

    const updated = (content.slice(0, blockStart) + content.slice(blockEnd)).replace(/\n{3,}/g, '\n\n').trim();
    return updated.length ? `${updated}\n` : '';
}

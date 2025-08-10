import { App } from "obsidian";

export interface Comment {
    filePath: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    selectedText: string;
    comment: string;
    timestamp: number;
}

export class CommentManager {
    private comments: Comment[];

    constructor(comments: Comment[]) {
        this.comments = comments;
    }

    getCommentsForFile(filePath: string): Comment[] {
        return this.comments.filter(comment => comment.filePath === filePath);
    }

    addComment(newComment: Comment) {
        this.comments.push(newComment);
    }

    editComment(timestamp: number, newCommentText: string) {
        const commentToEdit = this.comments.find(comment => comment.timestamp === timestamp);
        if (commentToEdit) {
            commentToEdit.comment = newCommentText;
        }
    }

    deleteComment(timestamp: number) {
        const indexToDelete = this.comments.findIndex(comment => comment.timestamp === timestamp);
        if (indexToDelete > -1) {
            this.comments.splice(indexToDelete, 1);
        }
    }
}

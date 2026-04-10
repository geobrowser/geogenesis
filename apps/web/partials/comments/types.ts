export interface CommentEntity {
  id: string;
  name: string | null;
  markdownContent: string;
  /** The entity being commented on */
  targetEntityId: string;
  /** The space being viewed when the comment was created */
  targetSpaceId: string;
  /** If this comment is a reply to another comment, the parent comment's entity ID */
  replyToCommentId: string | null;
  /** The space where the parent comment lives (commenter's personal space) */
  replyToCommentSpaceId: string | null;
  /** Author info derived from the space homepage entity of the personal space */
  author: {
    spaceId: string;
    /** Wallet address — used as the Avatar seed so jazzicons match the navbar */
    address: string;
    name: string | null;
    avatarUrl: string | null;
  };
  createdAt: string;
  /** The space where this comment entity lives (commenter's personal space) */
  spaceId: string;
  /** Whether this comment has been resolved */
  resolved: boolean;
}

export interface CommentWithReplies extends CommentEntity {
  replies: CommentWithReplies[];
}

export interface CreateCommentParams {
  text: string;
  targetEntityId: string;
  targetSpaceId: string;
  /** Immediate parent when replying to a comment; omit for a top-level comment on the page entity. */
  replyTo?: { entityId: string; spaceId: string };
}

export type CommentSortOrder = 'newest' | 'oldest';
export type CommentFilter = 'all' | 'editors';

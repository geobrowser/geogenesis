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
  /**
   * True while the chain publish (IPFS upload + userOp) is in flight. Surfaces as the
   * "Publishing…" tag. Cleared as soon as the publish Effect resolves, even though the
   * indexer may still be catching up — we don't need a UI indicator after that point
   * because the "Comment published!" toast has already told the user it's safe.
   */
  isPublishing?: boolean;
  /**
   * True while the optimistic row is waiting for the indexer to return the real comment.
   * Used by mergePendingWithServer to preserve client-only rows across cache refetches
   * (e.g. window-focus refetch) before the server has indexed them. No UI meaning.
   */
  isPendingPublish?: boolean;
}

export interface CommentWithReplies extends CommentEntity {
  replies: CommentWithReplies[];
}

export interface CreateCommentParams {
  text: string;
  targetEntityId: string;
  targetSpaceId: string;
  /**
   * The reply chain ordered [immediate parent, ..., root]; omit for a top-level comment on the
   * page entity. The hook maps index 0 (the immediate parent) to the SDK's `replyTo` target.
   */
  ancestorComments?: Array<{ id: string; spaceId: string }>;
}

export type CommentSortOrder = 'newest' | 'oldest';
export type CommentFilter = 'all' | 'editors';

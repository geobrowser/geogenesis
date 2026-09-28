import type * as React from 'react';

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

/**
 * How the thread orders its top level.
 *
 * `best` and `top` both read the rows' vote counts and differ in what they reward: `best` takes the
 * net score, so a divisive row falls; `top` takes upvotes alone, so a row lots of people backed
 * stays up regardless of how many pushed back. `newest`/`oldest` are the thread's original orders.
 */
export type CommentSortOrder = 'best' | 'top' | 'newest' | 'oldest';
export type CommentFilter = 'all' | 'editors';

/**
 * A non-comment row rendered in the same time-ordered list as the comments.
 *
 * The claim page's activity feed puts debates alongside comments on one thread, and the two are
 * ordered together rather than stacked in blocks. Rather than teach the comment list what a debate
 * is, the host hands it already-rendered content plus the one field the ordering needs.
 */
export interface CommentActivityRow {
  id: string;
  /** ISO timestamp, compared against each comment's `createdAt` to place the row. */
  createdAt: string;
  /** The entity whose votes rank this row, and the space they were cast in. */
  entityId: string;
  spaceId: string;
  content: React.ReactNode;
}

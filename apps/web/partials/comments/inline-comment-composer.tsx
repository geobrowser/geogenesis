'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { usePublishComment } from '~/core/hooks/use-publish-comment';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { useAdjustActivityPosts } from './activity-posts';
import { CommentInput } from './comments-section';

/**
 * A composer that opens where the reader is, against an entity the surrounding thread does not own.
 *
 * The claim page's activity feed holds rows for three different entities — the claim, the debates
 * on it, and the claims extracted from those — and until now every one of them answered "comment"
 * by opening the global panel. That is the right answer on an explore card, where there is nothing
 * around the row to lose. It is the wrong one here: the panel replaces the thread the reader is
 * reading with a flat list of one entity's comments, so the debate, the claim it argued and the
 * position badges all go away at the moment the reader wants to respond to them. Reddit never moves
 * you to reply, and the thread is legible for it.
 *
 * The write itself is unchanged — `usePublishComment` against the target entity, the same optimistic
 * row, the same retry when a personal space is still being created — so a comment made here and one
 * made in the panel are the same comment.
 */
export function InlineCommentComposer({
  composer,
  targetEntityId,
  targetSpaceId,
  targetEntityType = 'entity',
  ancestors,
  placeholder,
}: {
  /**
   * The row's disclosure, from {@link useInlineComposer}.
   *
   * Passed whole rather than as an `isComposing` prop plus two callbacks, because every caller wired
   * the same three things the same way around the same conditional — and the spacing above the box
   * belongs to the box, not to three copies of a wrapper.
   */
  composer: InlineComposerState;
  /** The entity being commented on: the debate, or the extracted claim, not the page's claim. */
  targetEntityId: string;
  targetSpaceId: string;
  targetEntityType?: string;
  /**
   * The comment chain above this one, nearest first, when replying rather than starting a thread.
   *
   * A reply carries `Reply to` to every ancestor, which is what lets one aggregate count a whole
   * tree — so an incomplete chain here does not merely mislabel the reply, it drops it out of the
   * counts the feed draws from.
   */
  ancestors?: Array<{ id: string; spaceId: string }>;
  placeholder: string;
}) {
  const { publishComment } = usePublishComment(targetEntityId, targetSpaceId, {
    targetEntityType,
    interactionSurface: 'activity_feed',
  });
  const { smartAccount } = useSmartAccount();
  const promptSignIn = usePrivySignIn();
  const isSignedIn = !!smartAccount;
  const { isComposing, close, markPosted, markPostRejected } = composer;
  const adjustActivityPosts = useAdjustActivityPosts();

  // Asked before the box opens, not after a draft is typed into it. The thread's own composer
  // checks at the same moment — on the press, not on the submit — because a signed-out reader who
  // types a paragraph and is then asked to sign in loses the paragraph.
  React.useEffect(() => {
    if (!isComposing || isSignedIn) return;
    promptSignIn();
    close();
    // Only on the transition into a signed-out open composer; `close` is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposing, isSignedIn]);

  if (!isComposing || !isSignedIn) return null;

  return (
    <div className="mt-2">
      <CommentInput
        analyticsLabel="Activity comment"
        placeholder={placeholder}
        autoFocus
        onCancel={close}
        onSubmit={text => {
          // Fire and forget, like every other composer: the box closes now and the optimistic row
          // carries the "Publishing…" state.
          void publishComment({
            text,
            ancestorComments: ancestors,
            onOptimistic: commentId => {
              markPosted(commentId);
              // The heading above counts things this section cannot see, so it cannot notice this on
              // its own.
              adjustActivityPosts(1);
            },
          }).then(result => {
            // A rejected transaction takes the optimistic row back out, so the heading has to give
            // back the one it just counted — and this row has to stop holding a branch open for a
            // comment that is no longer there. A retained publish returns a result and keeps its row,
            // so it keeps both.
            if (!result) {
              markPostRejected();
              adjustActivityPosts(-1);
            }
          });
          close();
        }}
      />
    </div>
  );
}

/**
 * Whether a row should be drawing a composer, and the toggle that says so.
 *
 * Each row owns this rather than a shared store, because two composers open at once in different
 * branches is a reasonable thing to want — a reader part-way through a reply should not lose it by
 * opening another. It also means nothing has to be torn down when a branch collapses.
 */
export type InlineComposerState = ReturnType<typeof useInlineComposer>;

export function useInlineComposer() {
  const [isComposing, setIsComposing] = React.useState(false);
  /**
   * How many comments written here are still standing.
   *
   * Sticky while it is above zero: the row keeps showing its thread even while the server count that
   * gated it is still reporting nothing, because the aggregate has not heard about a comment written
   * a second ago.
   *
   * A count rather than a flag, because a publish can be rejected. As a flag it latched true and
   * stayed there, so a rejected first comment left the row holding a branch with nothing in it — a
   * collapse control that collapsed nothing, and a comments fetch enabled to look for a comment that
   * had been taken back out. Counting means a rejection can undo exactly its own post and a reader
   * who published two comments and lost one keeps the branch for the one that stood.
   */
  const [postedCount, setPostedCount] = React.useState(0);

  return React.useMemo(
    () => ({
      isComposing,
      hasPosted: postedCount > 0,
      toggle: () => setIsComposing(open => !open),
      open: () => setIsComposing(true),
      close: () => setIsComposing(false),
      markPosted: (_commentId?: string) => {
        setPostedCount(posted => posted + 1);
        setIsComposing(false);
      },
      /** The transaction was rejected and the optimistic row is gone, so this post no longer counts. */
      markPostRejected: () => setPostedCount(posted => Math.max(0, posted - 1)),
    }),
    [isComposing, postedCount]
  );
}

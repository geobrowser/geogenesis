'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { usePublishComment } from '~/core/hooks/use-publish-comment';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { pendingCommentComposerAtom } from '~/core/state/pending-comment-intents';

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
  const { isComposing, close } = composer;
  const adjustActivityPosts = useAdjustActivityPosts();

  /**
   * Sign-in is asked for before the box opens, not after a draft is typed into it — the thread's own
   * composer checks at the same moment, because a signed-out reader who types a paragraph and is then
   * asked to sign in loses the paragraph.
   *
   * The press is remembered across it. This used to open Privy and close the box, and nothing brought
   * it back: a reader who signed in landed on the page with the box shut and had to find the control
   * again, which is not what pressing it said would happen. `CommentSection` already keeps that intent
   * in `pendingCommentComposerAtom`; this is the same atom, keyed the same way, so the two cannot
   * disagree — and keying on the reply as well as the entity is what stops a debate's own composer and
   * a reply composer under one of its comments from both opening on one press.
   */
  const replyToCommentId = ancestors?.[0]?.id ?? null;
  const [pendingComposer, setPendingComposer] = useAtom(pendingCommentComposerAtom);

  React.useEffect(() => {
    if (!isComposing || isSignedIn) return;
    setPendingComposer({ entityId: targetEntityId, replyToCommentId });
    promptSignIn();
    close();
    // Only on the transition into a signed-out open composer; `close` is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposing, isSignedIn]);

  React.useEffect(() => {
    if (!isSignedIn || pendingComposer == null) return;
    if (pendingComposer.entityId !== targetEntityId || pendingComposer.replyToCommentId !== replyToCommentId) return;
    setPendingComposer(null);
    composer.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, pendingComposer, targetEntityId, replyToCommentId]);

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
            // The heading above counts things this section cannot see, so it cannot notice this on its
            // own. Nothing else needs telling: the row's branch reads the live comment list, which the
            // optimistic row is already in.
            onOptimistic: () => adjustActivityPosts(1),
            // Whichever way it fails, and there are two: the transaction rejected now, or a publish
            // retained for a personal space that does not exist yet failing its retry later. Both take
            // the optimistic row back out, so the heading gives back the one it counted. The branch
            // needs no telling here either — the row leaving the list is the signal.
            onFailed: () => adjustActivityPosts(-1),
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

  // No record of what was posted from here, deliberately. There used to be one — a flag, then a count
  // so a rejection could undo it — and the rows read it to hold their branch open for a comment the
  // server aggregate had not heard about yet. It only knew about comments written from this row since
  // this mount: navigate away and back and it reset, while the aggregate still said none, so the
  // comment button reported the comment and the branch that would show it was gone. The rows read the
  // live comment list instead, which every composer writes to, survives a remount, and drops a
  // rejected comment on its own. What is left here is only whether the box is open.
  return React.useMemo(
    () => ({
      isComposing,
      toggle: () => setIsComposing(open => !open),
      open: () => setIsComposing(true),
      close: () => setIsComposing(false),
    }),
    [isComposing]
  );
}

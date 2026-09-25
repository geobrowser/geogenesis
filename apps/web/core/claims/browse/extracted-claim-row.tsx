'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { useOpenDebaterProfile } from '~/core/debates/browse/use-open-debater-profile';
import { isAssertableMoment } from '~/core/debates/claim-timing';
import { debateSeekSeconds, formatTimecode, withDebateTimecode } from '~/core/debates/debate-timecode';
import { useComments } from '~/core/hooks/use-comments';
import type { ResponseKind } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { type CommentDensity, PAGE_DENSITY, threadSpineOffsetPx } from '~/partials/comments/comment-density';
import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { InlineCommentComposer, useInlineComposer } from '~/partials/comments/inline-comment-composer';
import { ThreadBranch, ThreadBranchRow } from '~/partials/comments/thread-branch-list';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ActivityRowTag } from './activity-row-tag';
import { canNestBelow } from './claim-activity-depth';
import type { OrderedTranscriptClaim } from './claim-activity-order';
import { ResponsePositionTag } from './claim-comment-position';
import { DebateCommentRow } from './debate-comment-row';

export type SpeakerProfile = { name?: string | null; avatarUrl?: string | null };

/**
 * One claim a debater made, as a row under the debate it was extracted from.
 *
 * Deliberately not the explore card. That card gives a claim a headline, a 220px verdict rail and
 * labelled Agree/Disagree pills, which is right when the claim is the thing being read and far too
 * much when six of them hang off a single debate two levels into a thread. What survives the cut is
 * everything the reader needs to act without leaving: the split, who is on it, a vote, and the way
 * back to the moment it was said. The full treatment is one click away on the claim's own page.
 *
 * Built out of what the thread around it already uses: the comment row's own density metrics, the
 * same `Avatar` framing every other avatar in the app gets, `EntityVoteButtons` (which already
 * draws responder faces beside the control and picks its icons from the response kind — thumbs for
 * a stance, chevrons for veracity), and `EntityCommentsButton`. Nothing here is a new control.
 */
export function ExtractedClaimRow({
  claim,
  debateId,
  debateSpaceId,
  responseKind,
  speaker,
  speakerPosition,
  responseVocabulary,
  commentCount = 0,
  depth,
  density = PAGE_DENSITY,
  className,
}: {
  claim: OrderedTranscriptClaim;
  /** The debate this was said in, which is where the timecode link goes. */
  debateId: string;
  debateSpaceId: string;
  /**
   * Resolved once for the whole debate rather than per row.
   *
   * `EntityVoteButtons` derives this itself when the prop is omitted, at the cost of an entity read
   * per instance — twenty extracted claims would mean twenty of them. Passing it down is the
   * difference between one lookup and one per row.
   */
  responseKind: ResponseKind;
  /** The debater this turn is attributed to, or null on a block with no `Authors` relation. */
  speaker: (SpeakerProfile & { spaceId: string }) | null;
  /**
   * The side that debater argued, from the debate's own `Supported by` / `Opposed by` relations.
   *
   * Not the same fact as a commenter's badge, which reports where they stand *now*. This one is
   * fixed: it is the side they took in the debate this claim came out of, and it cannot drift.
   * Null when the speaker is unknown or the debate does not record a side for them.
   */
  speakerPosition: boolean | null;
  /** The claim page's vocabulary, so the tag reads Agree/Disagree or Verify/Dispute to match. */
  responseVocabulary: DebateResponseKind;
  /**
   * How many comments the claim has, counted by the server.
   *
   * Passed rather than left to the button's own seed: that seed only ever corrects *downward*, from
   * a list somebody has opened, so a row with no count to give reads "0" on a claim that has
   * comments — a number wrong in the one direction that tells the reader not to look.
   */
  commentCount?: number;
  /** This row's depth, counted from the claim. Its comments sit one below it. */
  depth: number;
  /** The surrounding thread's metrics, so these rows sit on the same ramp as the comments. */
  density?: CommentDensity;
  className?: string;
}) {
  const composer = useInlineComposer();
  const openSpeakerProfile = useOpenDebaterProfile(speaker?.spaceId, { interactionSurface: 'extracted_claim_speaker' });

  // Null where the graph reports no home space. The claim is then unlinkable and unrespondable —
  // pointing a vote at this page's space instead would record it somewhere the claim does not live,
  // which reads back as a claim nobody answered. Read-only is the honest rendering.
  const claimSpaceId = claim.spaceId;

  // A moment good enough to sort by is not always good enough to state. A `block` fallback timing
  // places the claim at the start of the turn it was said in, which can be most of a minute early;
  // printing that as a timecode, and offering to seek to it, would both be assertions we cannot
  // make. `isAssertableMoment` is the bar the debate surfaces already use for this.
  const moment = isAssertableMoment(claim.timing) ? claim.timing : null;
  const timecodeHref = moment
    ? withDebateTimecode(NavUtils.toEntity(debateSpaceId, debateId), debateSeekSeconds(moment.startMs))
    : null;

  return (
    // `gap-3` is the comment header's own 12px avatar gap, so a claim row and a comment row put
    // their text on the same left edge.
    <div className={cx('flex min-w-0 gap-3', className)}>
      {/*
        `Avatar` fills its container whenever it has a real `avatarUrl` to draw — `size` only sizes
        the generated fallback — so the frame is the caller's job. Same shape the comment rows in
        this thread use, off the same density, which is what keeps the two kinds of row aligned.
      */}
      <SpeakerLink speaker={speaker} onOpenProfile={openSpeakerProfile} className="self-start">
        <span
          className="relative shrink-0 overflow-hidden rounded-full"
          style={{ width: density.avatarPx, height: density.avatarPx }}
        >
          <Avatar avatarUrl={speaker?.avatarUrl ?? null} value={speaker?.spaceId} size={density.avatarPx} />
        </span>
      </SpeakerLink>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <SpeakerLink speaker={speaker} onOpenProfile={openSpeakerProfile} className="min-w-0">
            <span className={cx(density.nameClass, 'truncate text-text')}>
              {speaker?.name?.trim() || 'Unnamed debater'}
            </span>
          </SpeakerLink>

          <ActivityRowTag kind="claim" />

          {speakerPosition !== null && (
            <ResponsePositionTag responseKind={responseVocabulary} position={speakerPosition} />
          )}

          {timecodeHref ? (
            <Link
              href={timecodeHref}
              // The label says what pressing it does, because "12:04" on its own reads as a fact
              // about the claim rather than as a control.
              aria-label={`Watch from ${formatTimecode(moment!.startMs)}`}
              className={cx(
                density.metaClass,
                'inline-flex shrink-0 items-center gap-1 rounded-full border border-grey-02 px-2 py-px text-ctaPrimary tabular-nums no-underline transition-colors hover:border-ctaPrimary'
              )}
            >
              <PlayGlyph />
              {formatTimecode(moment!.startMs)}
            </Link>
          ) : (
            // Said, but not placed: a restated claim, or one the matcher could not find. Better to
            // say the moment is missing than to leave the row looking like it simply has no time.
            <span className={cx(density.metaClass, 'shrink-0 text-grey-04 italic')}>moment not found</span>
          )}
        </div>

        {claimSpaceId ? (
          <Link href={NavUtils.toEntity(claimSpaceId, claim.id)} className="group/claim min-w-0 no-underline">
            <span className={cx(density.bodyClass, 'wrap-break-word text-text group-hover/claim:underline')}>
              {claim.text}
            </span>
          </Link>
        ) : (
          <span className={cx(density.bodyClass, 'wrap-break-word text-text')}>{claim.text}</span>
        )}

        {claimSpaceId ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
            <EntityVoteButtons
              entityId={claim.id}
              spaceId={claimSpaceId}
              responseKind={responseKind}
              // Faces after the control rather than before it. On the claim page's own surfaces the
              // stack leads, because it is the first thing in its row; here the row opens with the
              // speaker's avatar already, and a second cluster of faces on the left made the two
              // read as one group.
              claimResponderAvatarsPosition="trailing"
            />
            <EntityCommentsButton
              entityId={claim.id}
              spaceId={claimSpaceId}
              targetEntityType="claim"
              count={commentCount}
              // In place rather than in the panel: the claim's comments are already drawn below this
              // row, so the panel would replace a thread the reader can see with the same rows minus
              // the debate they came out of.
              onActivate={composer.toggle}
              isActive={composer.isComposing}
            />
          </div>
        ) : null}

        {claimSpaceId && composer.isComposing && (
          <div className="mt-2">
            <InlineCommentComposer
              targetEntityId={claim.id}
              targetSpaceId={claimSpaceId}
              targetEntityType="claim"
              placeholder="Comment on this claim..."
              onCancel={composer.close}
              onPosted={composer.markPosted}
            />
          </div>
        )}

        {/* `composer.hasPosted` as well as the server count: the aggregate that gates this is from
            the page load, so a reader's first comment on a silent claim would otherwise be written
            and then not drawn. */}
        {claimSpaceId && (commentCount > 0 || composer.hasPosted) && canNestBelow(depth) && (
          <ClaimComments claimId={claim.id} spaceId={claimSpaceId} depth={depth + 1} />
        )}
      </div>
    </div>
  );
}

/**
 * The comments people have left on one extracted claim.
 *
 * Only mounted where the feed's own aggregate already said there are some, so a debate's ten silent
 * claims cost ten fetches of nothing. That gate is why this can be eager at all: in the corpus today
 * almost every extracted claim has no comments, and the few that do are worth a request.
 */
function ClaimComments({ claimId, spaceId, depth }: { claimId: string; spaceId: string; depth: number }) {
  const { comments } = useComments({ entityId: claimId, spaceId });
  if (comments.length === 0) return null;

  return (
    <div className="mt-3">
      <ThreadBranch rowDensity={PAGE_DENSITY} reachPx={threadSpineOffsetPx(PAGE_DENSITY)}>
        {comments.map((comment, index) => (
          <ThreadBranchRow key={comment.id} isLast={index === comments.length - 1}>
            <DebateCommentRow comment={comment} targetEntityId={claimId} spaceId={spaceId} depth={depth} />
          </ThreadBranchRow>
        ))}
      </ThreadBranch>
    </div>
  );
}

/**
 * The speaker's name and face, opening their profile beside the thread.
 *
 * An anchor rather than a button so middle-click and "copy link" still reach their space; the click
 * itself is intercepted, because navigating away from a claim to read who said something is exactly
 * the context loss the side panel exists to avoid. Unattributed turns get no link — there is no
 * person to open.
 *
 * `inline-flex`, and this is load-bearing rather than tidiness. The avatar's frame is a `span` sized
 * by inline width and height, and it used to be a direct child of the row's flex container, where
 * being a flex item blockified it and those dimensions applied. Wrapping it in an anchor made the
 * anchor the flex item and left the span `display: inline`, which ignores both — so the `h-full
 * w-full` image inside resolved against nothing and rendered at its natural size, a 987px face in a
 * 32px row. Making this a flex container puts the span back to being a flex item.
 *
 * The caller supplies the cross-axis alignment, because the two uses want opposite things and the
 * wrapper cannot know which it is. The face needs `self-start`: it is a flex item of the row, which
 * stretches its items, and a stretched anchor centres the 32px frame against the row's full height —
 * dropping the avatar off the name line and down beside the claim text. The name is inside an
 * already-centred header, so it wants no alignment of its own.
 */
function SpeakerLink({
  speaker,
  onOpenProfile,
  className,
  children,
}: {
  speaker: (SpeakerProfile & { spaceId: string }) | null;
  onOpenProfile: (event: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!speaker) return <>{children}</>;

  return (
    <a
      href={NavUtils.toSpace(speaker.spaceId)}
      onClick={onOpenProfile}
      className={cx('inline-flex shrink-0 overflow-hidden no-underline hover:underline', className)}
    >
      {children}
    </a>
  );
}

function PlayGlyph() {
  return (
    <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">
      <path d="M0.5 0.5 L6.5 4 L0.5 7.5 Z" />
    </svg>
  );
}

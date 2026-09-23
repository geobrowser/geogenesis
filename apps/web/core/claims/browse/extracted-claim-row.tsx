'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { isAssertableMoment } from '~/core/debates/claim-timing';
import { debateSeekSeconds, formatTimecode, withDebateTimecode } from '~/core/debates/debate-timecode';
import type { ResponseKind } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { type CommentDensity, PAGE_DENSITY } from '~/partials/comments/comment-density';
import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import type { OrderedTranscriptClaim } from './claim-activity-order';
import { ResponsePositionTag } from './claim-comment-position';

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
  /** The surrounding thread's metrics, so these rows sit on the same ramp as the comments. */
  density?: CommentDensity;
  className?: string;
}) {
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
      <span
        className="relative shrink-0 overflow-hidden rounded-full"
        style={{ width: density.avatarPx, height: density.avatarPx }}
      >
        <Avatar avatarUrl={speaker?.avatarUrl ?? null} value={speaker?.spaceId} size={density.avatarPx} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cx(density.nameClass, 'truncate text-text')}>
            {speaker?.name?.trim() || 'Unnamed debater'}
          </span>

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
              // No server-rendered seed on this surface. The button's live count takes over the
              // moment the list is read, and a zero that corrects itself upward is better than a
              // number invented here.
              count={0}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" aria-hidden="true">
      <path d="M0.5 0.5 L6.5 4 L0.5 7.5 Z" />
    </svg>
  );
}

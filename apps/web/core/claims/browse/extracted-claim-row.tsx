'use client';

import * as React from 'react';

import cx from 'classnames';

import { isAssertableMoment } from '~/core/debates/claim-timing';
import { debateSeekSeconds, formatTimecode, withDebateTimecode } from '~/core/debates/debate-timecode';
import type { ResponseKind } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import type { OrderedTranscriptClaim } from './claim-activity-order';

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
 * Nothing here is new machinery. `EntityVoteButtons` already draws responder faces beside the
 * control and already picks its icons from the response kind — thumbs for a stance, chevrons for
 * veracity — so a factual claim cannot end up with a thumb labelled "agree".
 */
export function ExtractedClaimRow({
  claim,
  debateId,
  debateSpaceId,
  responseKind,
  speaker,
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
    <div className={cx('flex min-w-0 gap-2.5', className)}>
      <span className="mt-0.5 shrink-0">
        <Avatar avatarUrl={speaker?.avatarUrl ?? null} value={speaker?.spaceId} size={24} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Text as="span" variant="metadataMedium" color="text" className="truncate">
            {speaker?.name?.trim() || 'Unnamed debater'}
          </Text>

          {timecodeHref ? (
            <Link
              href={timecodeHref}
              // The label says what pressing it does, because "12:04" on its own reads as a fact
              // about the claim rather than as a control.
              aria-label={`Watch from ${formatTimecode(moment!.startMs)}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-grey-02 px-2 py-px text-metadata text-ctaPrimary tabular-nums transition-colors hover:border-ctaPrimary"
            >
              <PlayGlyph />
              {formatTimecode(moment!.startMs)}
            </Link>
          ) : (
            // Said, but not placed: a restated claim, or one the matcher could not find. Better to
            // say the moment is missing than to leave the row looking like it simply has no time.
            <Text as="span" variant="metadata" color="grey-04" className="shrink-0 italic">
              moment not found
            </Text>
          )}
        </div>

        {claimSpaceId ? (
          <Link
            href={NavUtils.toEntity(claimSpaceId, claim.id)}
            className="group/claim min-w-0 no-underline"
          >
            <Text as="span" variant="body" color="text" className="wrap-break-word group-hover/claim:underline">
              {claim.text}
            </Text>
          </Link>
        ) : (
          <Text as="span" variant="body" color="text" className="wrap-break-word">
            {claim.text}
          </Text>
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

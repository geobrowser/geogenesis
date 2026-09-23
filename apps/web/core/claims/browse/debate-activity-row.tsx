'use client';

import * as React from 'react';

import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateClaims } from '~/core/debates/hooks';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { uuidToHex } from '~/core/id/normalize';
import type { ResponseKind } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { orderExtractedClaims } from './claim-activity-order';
import { ExtractedClaimRow, type SpeakerProfile } from './extracted-claim-row';

/**
 * How many extracted claims a debate shows before it asks.
 *
 * Depth is capped separately (replies below level two are behind their own button); this is the
 * breadth cap, and it is the one that actually bites. A debate can carry twenty extracted claims
 * without ever exceeding the depth cap, which would put the next debate below a screen and a half
 * of someone else's transcript.
 */
const EXTRACTED_CLAIM_PAGE_SIZE = 4;

export type DebateActivityRowProps = {
  debate: Entity;
  /** The space the claim page is being read through, which is where the debate was published. */
  spaceId: string;
  /** Debater names and faces, resolved once for the whole feed. */
  profilesBySpaceId: Map<string, SpeakerProfile>;
  participantSpaceIds: string[];
  keyframeUrl: string | null;
  publishedAt: Date | null;
};

/**
 * A debate, as a row in the claim's activity feed, with the claims pulled out of it as its replies.
 *
 * The thumbnail is the still the debate was published with rather than a mounted player. Three
 * debate rows on a page would otherwise be three `DebateFeedPlayer`s fetching and decoding at once
 * for a reader who is scrolling past all of them; the still costs one image, and Watch is one click.
 *
 * The score is the ordinary entity upvote/downvote, not a who-won tally. Winner voting is being
 * sunset, and a row whose number needed a footnote to say which kind of voting produced it was
 * exactly the confusion worth removing.
 */
export function DebateActivityRow({
  debate,
  spaceId,
  profilesBySpaceId,
  participantSpaceIds,
  keyframeUrl,
  publishedAt,
}: DebateActivityRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [visibleClaims, setVisibleClaims] = React.useState(EXTRACTED_CLAIM_PAGE_SIZE);
  const { openComments } = useEntityCommentsPanel();

  const debaters = participantSpaceIds
    .map(id => profilesBySpaceId.get(id)?.name?.trim())
    .filter((name): name is string => Boolean(name));
  const title = debaters.length > 0 ? debaters.join(' vs. ') : (debate.name ?? 'Debate');

  return (
    <article className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 gap-3">
        {/* Portrait, because that is the shape the video actually is: `Debate videos` declares
            540 × 820, so a 16:9 tile would letterbox every still it ever showed. Same geometry
            `ClaimDebates` uses, so the two surfaces show a debate the same way. */}
        <Link
          href={NavUtils.toEntity(spaceId, debate.id)}
          aria-label={`Watch ${title}`}
          className="relative block aspect-[540/820] w-12 shrink-0 overflow-hidden rounded-md bg-grey-01"
        >
          {keyframeUrl && <GeoImage value={keyframeUrl} alt="" fill sizes="48px" className="object-cover" />}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Text as="span" variant="metadataMedium" color="text" className="truncate">
              {title}
            </Text>
            <span className="shrink-0 rounded-xs bg-grey-01 px-1.5 py-px text-metadata text-grey-04">Debate</span>
            {publishedAt && (
              <Text as="span" variant="metadata" color="grey-04" className="shrink-0 tabular-nums">
                {publishedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
            <EntityVoteButtons entityId={debate.id} spaceId={spaceId} responseKind="curation" />
            <EntityCommentsButton entityId={debate.id} spaceId={spaceId} count={0} />
            {/* A reply to a debate is a comment on the debate, so it goes where that entity's
                comments already live rather than into this claim's thread. The panel is the
                existing surface for commenting on an entity you are not currently reading. */}
            <button
              type="button"
              data-entity-comments-opener
              onClick={() => openComments(debate.id, spaceId)}
              className="text-metadata text-grey-04 transition-colors hover:text-text"
            >
              Reply
            </button>
            <Link href={NavUtils.toEntity(spaceId, debate.id)} className="text-metadata text-ctaPrimary no-underline hover:underline">
              Watch debate
            </Link>
          </div>
        </div>
      </div>

      <ExtractedClaims
        debateId={debate.id}
        spaceId={spaceId}
        profilesBySpaceId={profilesBySpaceId}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        visibleCount={visibleClaims}
        onShowMore={() => setVisibleClaims(count => count + EXTRACTED_CLAIM_PAGE_SIZE)}
      />
    </article>
  );
}

/**
 * The debate's extracted claims, in the order they were said.
 *
 * Held behind an expand rather than loaded with the row. The traversal is one request per debate
 * and the timing resolver may want the Whisper transcript on top of it, so a feed of five debates
 * would be ten requests for rows the reader has not asked to see. Expanding one debate is one
 * debate's worth of work.
 */
function ExtractedClaims({
  debateId,
  spaceId,
  profilesBySpaceId,
  expanded,
  onExpand,
  visibleCount,
  onShowMore,
}: {
  debateId: string;
  spaceId: string;
  profilesBySpaceId: Map<string, SpeakerProfile>;
  expanded: boolean;
  onExpand: () => void;
  visibleCount: number;
  onShowMore: () => void;
}) {
  const { claims, isLoading } = useDebateTranscriptClaims(debateId, spaceId, expanded);
  // Free for the 86% of statements that carry a published offset — the resolver only reaches for
  // the transcript when a debate has one that does not. See `useClaimTimings`.
  const { timings, isReady } = useClaimTimings(debateId, claims, expanded);

  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  // One call for every extracted claim on screen. Without it each row's own vote control would read
  // the entity to work out whether it takes thumbs or chevrons — one request per row.
  const claimRows = useDebateClaims(spaceId, claimIds, expanded && claimIds.length > 0);
  const responseKindByClaimId = React.useMemo(() => {
    const map = new Map<string, ResponseKind>();
    for (const row of claimRows.data?.claims ?? []) {
      map.set(uuidToHex(row.claim_entity_id), row.response_kind === 'veracity' ? 'veracity' : 'stance');
    }
    return map;
  }, [claimRows.data?.claims]);

  const speakerBySourceBlockId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const block of claims.blocks) {
      if (block.authorSpaceId) map.set(uuidToHex(block.id), block.authorSpaceId);
    }
    return map;
  }, [claims.blocks]);

  const ordered = React.useMemo(() => orderExtractedClaims(claims.all, timings), [claims.all, timings]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="self-start pl-[60px] text-metadata text-ctaPrimary transition-colors hover:text-ctaHover"
      >
        Show claims from this debate
      </button>
    );
  }

  if (isLoading || !isReady) {
    // Held rather than painted unordered. `isReady` is false only while a timing source is still
    // arriving, and it reports ready on a failed transcript fetch — so this cannot hang forever on
    // a debate whose transcript is gone; that degrades to "all untimed, arrival order".
    return <Skeleton className="ml-[60px] h-16 rounded" />;
  }

  // Timed first, in order, then the ones nothing could place. The tail is not sorted among itself:
  // there is nothing to sort it by, and imposing an order would say there was.
  const rows = [...ordered.timed, ...ordered.untimed];

  if (rows.length === 0) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="pl-[60px]">
        No claims were extracted from this debate.
      </Text>
    );
  }

  const visible = rows.slice(0, visibleCount);
  const remaining = rows.length - visible.length;

  return (
    <div className="flex flex-col gap-3 border-l border-grey-02 pl-5 ml-[24px]">
      {visible.map(claim => {
        const speakerSpaceId = speakerBySourceBlockId.get(uuidToHex(claim.blockId)) ?? null;
        return (
          <ExtractedClaimRow
            key={claim.id}
            claim={claim}
            debateId={debateId}
            debateSpaceId={spaceId}
            // Stance unless geo-chat says otherwise. A missing row means the space is not indexed,
            // not that the claim is factual, and stance is what the graph defaults to as well.
            responseKind={responseKindByClaimId.get(uuidToHex(claim.id)) ?? 'stance'}
            speaker={
              // A restated claim carries the first relation's block, which cannot answer for both
              // statements — `transcript-claims.ts` flags it rather than letting one stand in for
              // the other, so the row declines to name a speaker instead of guessing.
              speakerSpaceId && !claim.restated
                ? { spaceId: speakerSpaceId, ...(profilesBySpaceId.get(speakerSpaceId) ?? {}) }
                : null
            }
          />
        );
      })}

      {remaining > 0 && (
        <button
          type="button"
          onClick={onShowMore}
          className="self-start text-metadata text-ctaPrimary transition-colors hover:text-ctaHover"
        >
          Show {remaining} more {remaining === 1 ? 'claim' : 'claims'}
        </button>
      )}
    </div>
  );
}

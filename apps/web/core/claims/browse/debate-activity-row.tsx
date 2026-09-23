'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { uuidToHex } from '~/core/id/normalize';
import type { ResponseKind } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { type CommentDensity, PAGE_DENSITY } from '~/partials/comments/comment-density';
import { getRelativeTime } from '~/partials/comments/comment-time';
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

/** Same 48px the claim page's debates module uses, in the 540 × 820 the videos are published at. */
const KEYFRAME_WIDTH_PX = 48;

export type DebateActivityRowProps = {
  debate: Entity;
  /** The space the claim page is being read through, which is where the debate was published. */
  spaceId: string;
  /** Debater names and faces, resolved once for the whole feed. */
  profilesBySpaceId: Map<string, SpeakerProfile>;
  /** Each debater and the side they argued, from `Supported by` / `Opposed by`. */
  sides: Array<{ spaceId: string; position: boolean }>;
  /** The claim page's vocabulary, so a debater's side reads in the claim's own terms. */
  responseVocabulary: DebateResponseKind;
  /** What the debate argued. The row's body — without it the row is a byline and a control strip. */
  claimText: string | null;
  keyframeUrl: string | null;
  publishedAt: Date | null;
  /** The surrounding thread's metrics, so this row sits on the same ramp as the comments. */
  density?: CommentDensity;
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
  sides,
  responseVocabulary,
  claimText,
  keyframeUrl,
  publishedAt,
  density = PAGE_DENSITY,
}: DebateActivityRowProps) {
  const [visibleClaims, setVisibleClaims] = React.useState(EXTRACTED_CLAIM_PAGE_SIZE);
  const { openComments } = useEntityCommentsPanel();

  const debaters = sides
    .map(side => profilesBySpaceId.get(side.spaceId)?.name?.trim())
    .filter((name): name is string => Boolean(name));
  const positionBySpaceId = React.useMemo(
    () => new Map(sides.map(side => [uuidToHex(side.spaceId), side.position])),
    [sides]
  );
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
          className="relative block aspect-[540/820] shrink-0 overflow-hidden rounded-md bg-grey-01"
          style={{ width: KEYFRAME_WIDTH_PX }}
        >
          {keyframeUrl && (
            <GeoImage value={keyframeUrl} alt="" fill sizes={`${KEYFRAME_WIDTH_PX}px`} className="object-cover" />
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cx(density.nameClass, 'truncate text-text')}>{title}</span>
            <span className={cx(density.metaClass, 'shrink-0 rounded-xs bg-grey-01 px-1.5 py-px text-grey-04')}>
              Debate
            </span>
            {publishedAt && (
              // Same helper and same classes the comment rows use, so a debate and a comment in one
              // thread age identically rather than reading as two lists side by side.
              <span className={cx(density.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
                {getRelativeTime(publishedAt.toISOString())}
              </span>
            )}
          </div>

          {claimText && (
            <Link href={NavUtils.toEntity(spaceId, debate.id)} className="group/debate min-w-0 no-underline">
              <span className={cx(density.bodyClass, 'wrap-break-word text-text group-hover/debate:underline')}>
                {claimText}
              </span>
            </Link>
          )}

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
              className={cx(density.metaClass, 'text-grey-04 transition-colors hover:text-text')}
            >
              Reply
            </button>
            <Link
              href={NavUtils.toEntity(spaceId, debate.id)}
              className={cx(density.metaClass, 'text-ctaPrimary no-underline hover:underline')}
            >
              Watch debate
            </Link>
          </div>
        </div>
      </div>

      <ExtractedClaims
        debateId={debate.id}
        spaceId={spaceId}
        profilesBySpaceId={profilesBySpaceId}
        positionBySpaceId={positionBySpaceId}
        responseVocabulary={responseVocabulary}
        density={density}
        visibleCount={visibleClaims}
        onShowMore={() => setVisibleClaims(count => count + EXTRACTED_CLAIM_PAGE_SIZE)}
      />
    </article>
  );
}

/**
 * The debate's extracted claims, in the order they were said.
 *
 * Loaded with the row rather than behind an expand. What a debate *produced* is the reason it is in
 * this feed at all, and a row that only says a debate happened is the state the feed was built to
 * replace — the reader should not have to ask twice to see the argument.
 *
 * The cost that bought the expand is smaller than it looks: the traversal is one request per
 * debate, and the timing resolver reaches for the Whisper transcript only when a debate has a claim
 * with no published offset — which, since the backfill, is two debates in the corpus. The breadth
 * cap below is what keeps a long transcript from owning the page.
 */
function ExtractedClaims({
  debateId,
  spaceId,
  profilesBySpaceId,
  positionBySpaceId,
  responseVocabulary,
  density,
  visibleCount,
  onShowMore,
}: {
  debateId: string;
  spaceId: string;
  profilesBySpaceId: Map<string, SpeakerProfile>;
  /** Debater space id (canonical) → the side they argued in this debate. */
  positionBySpaceId: Map<string, boolean>;
  responseVocabulary: DebateResponseKind;
  density: CommentDensity;
  visibleCount: number;
  onShowMore: () => void;
}) {
  const { claims, isLoading } = useDebateTranscriptClaims(debateId, spaceId);
  const { timings, isReady } = useClaimTimings(debateId, claims);

  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  // One call for every extracted claim on screen. Without it each row's own vote control would read
  // the entity to work out whether it takes thumbs or chevrons — one request per row.
  const claimRows = useDebateClaims(spaceId, claimIds, claimIds.length > 0);
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

  // The list hangs where a reply to this row would: the thread's own body inset, so an extracted
  // claim and a comment reply sit on the same left edge.
  const nestedStyle = { marginLeft: density.avatarCenterPx, paddingLeft: density.bodyInsetPx - density.avatarCenterPx };

  if (isLoading || !isReady) {
    // Held rather than painted unordered. `isReady` is false only while a timing source is still
    // arriving, and it reports ready on a failed transcript fetch — so this cannot hang forever on
    // a debate whose transcript is gone; that degrades to "all untimed, arrival order".
    return <Skeleton className="h-16 rounded" style={nestedStyle} />;
  }

  // Timed first, in order, then the ones nothing could place. The tail is not sorted among itself:
  // there is nothing to sort it by, and imposing an order would say there was.
  const rows = [...ordered.timed, ...ordered.untimed];

  // Silent rather than apologetic. Claim extraction postdates a chunk of the corpus, so a debate
  // with none is ordinary — and a line saying so under every old debate is noise in a feed.
  if (rows.length === 0) return null;

  const visible = rows.slice(0, visibleCount);
  const remaining = rows.length - visible.length;

  return (
    <div className="flex flex-col gap-4 border-l border-grey-02" style={nestedStyle}>
      {visible.map(claim => {
        const speakerSpaceId = speakerBySourceBlockId.get(uuidToHex(claim.blockId)) ?? null;
        return (
          <ExtractedClaimRow
            key={claim.id}
            claim={claim}
            debateId={debateId}
            debateSpaceId={spaceId}
            density={density}
            // Stance unless geo-chat says otherwise. A missing row means the space is not indexed,
            // not that the claim is factual, and stance is what the graph defaults to as well.
            responseKind={responseKindByClaimId.get(uuidToHex(claim.id)) ?? 'stance'}
            responseVocabulary={responseVocabulary}
            // A debater who is somehow not recorded on either side gets no tag rather than a
            // guessed one — the same rule the speaker name follows a line below.
            speakerPosition={
              speakerSpaceId && !claim.restated
                ? (positionBySpaceId.get(uuidToHex(speakerSpaceId)) ?? null)
                : null
            }
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
          className={cx(density.metaClass, 'self-start text-ctaPrimary transition-colors hover:text-ctaHover')}
        >
          Show {remaining} more {remaining === 1 ? 'claim' : 'claims'}
        </button>
      )}
    </div>
  );
}

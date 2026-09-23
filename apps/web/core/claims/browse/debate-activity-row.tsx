'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useEntityCommentCounts } from '~/core/comments/use-entity-comment-counts';
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
import { ThreadArm, ThreadElbow, ThreadSpine } from '~/partials/comments/thread-branch';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { orderExtractedClaims } from './claim-activity-order';
import { ExtractedClaimRow, type SpeakerProfile } from './extracted-claim-row';

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
  const [collapsed, setCollapsed] = React.useState(false);
  const { openComments } = useEntityCommentsPanel();
  // One aggregate for this row's own comment count. Without it the button seeds itself at zero and
  // only ever corrects downward, so a debate with comments read "0" until the panel was opened.
  const debateCommentCount = useEntityCommentCounts(React.useMemo(() => [debate.id], [debate.id]));

  const debaters = sides
    .map(side => profilesBySpaceId.get(side.spaceId)?.name?.trim())
    .filter((name): name is string => Boolean(name));
  const positionBySpaceId = React.useMemo(
    () => new Map(sides.map(side => [uuidToHex(side.spaceId), side.position])),
    [sides]
  );
  const title = debaters.length > 0 ? debaters.join(' vs. ') : (debate.name ?? 'Debate');

  return (
    <article className="flex min-w-0 flex-col">
      <div className="mb-3 flex min-w-0 gap-3">
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
            <EntityCommentsButton
              entityId={debate.id}
              spaceId={spaceId}
              count={debateCommentCount.get(uuidToHex(debate.id)) ?? 0}
            />
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
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(value => !value)}
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
  collapsed,
  onToggleCollapsed,
}: {
  debateId: string;
  spaceId: string;
  profilesBySpaceId: Map<string, SpeakerProfile>;
  /** Debater space id (canonical) → the side they argued in this debate. */
  positionBySpaceId: Map<string, boolean>;
  responseVocabulary: DebateResponseKind;
  density: CommentDensity;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { claims, isLoading } = useDebateTranscriptClaims(debateId, spaceId);
  const { timings, isReady } = useClaimTimings(debateId, claims);

  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  // One call for every extracted claim on screen. Without it each row's own vote control would read
  // the entity to work out whether it takes thumbs or chevrons — one request per row.
  const claimRows = useDebateClaims(spaceId, claimIds, claimIds.length > 0);
  const commentCounts = useEntityCommentCounts(claimIds);
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

  // The branch hangs where a reply to this row would: indented to the parent's avatar centre and
  // then out to the thread's body inset, so an extracted claim and a comment reply share a left
  // edge and the connectors reach back to the same point.
  const branchStyle = {
    marginLeft: density.avatarCenterPx,
    paddingLeft: density.bodyInsetPx - density.avatarCenterPx,
  };

  // Measured rather than computed: the spine has to stop at the last row's arm, and the rows are
  // variable height (a claim sentence wraps to one line or three). Same approach `CommentList` takes
  // for exactly the same reason.
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastRowRef = React.useRef<HTMLDivElement>(null);
  const [spineHeightPx, setSpineHeightPx] = React.useState<number | null>(null);

  const measureSpine = React.useCallback(() => {
    const container = containerRef.current;
    const lastRow = lastRowRef.current;
    if (!container || !lastRow) {
      setSpineHeightPx(null);
      return;
    }
    setSpineHeightPx(lastRow.getBoundingClientRect().top - container.getBoundingClientRect().top);
  }, []);

  React.useLayoutEffect(() => {
    measureSpine();
    const container = containerRef.current;
    if (container == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureSpine());
    observer.observe(container);
    return () => observer.disconnect();
  });

  if (isLoading || !isReady) {
    // Held rather than painted unordered. `isReady` is false only while a timing source is still
    // arriving, and it reports ready on a failed transcript fetch — so this cannot hang forever on
    // a debate whose transcript is gone; that degrades to "all untimed, arrival order".
    return <Skeleton className="h-16 rounded" style={branchStyle} />;
  }

  // Timed first, in order, then the ones nothing could place. The tail is not sorted among itself:
  // there is nothing to sort it by, and imposing an order would say there was.
  const rows = [...ordered.timed, ...ordered.untimed];

  // Silent rather than apologetic. Claim extraction postdates a chunk of the corpus, so a debate
  // with none is ordinary — and a line saying so under every old debate is noise in a feed.
  if (rows.length === 0) return null;

  // Every claim, not a page of them. These are what the debate produced; a reader who has scrolled
  // to a debate has asked for them, and "Show 17 more claims" was asking a second time. The spine
  // collapses the whole branch in one press, which is the control that actually shortens the page.
  const collapseLabel = {
    expand: `Expand ${rows.length} claims from this debate`,
    collapse: `Collapse ${rows.length} claims from this debate`,
  };

  if (collapsed) {
    return (
      <div style={branchStyle}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cx(density.metaClass, 'text-ctaPrimary transition-colors hover:text-ctaHover')}
        >
          Show {rows.length} {rows.length === 1 ? 'claim' : 'claims'} from this debate
        </button>
      </div>
    );
  }

  return (
    <div className="comment-branch-list-root relative flex flex-col gap-4" style={branchStyle} ref={containerRef}>
      <ThreadSpine
        density={density}
        heightPx={spineHeightPx}
        lit={false}
        collapsed={false}
        onToggle={onToggleCollapsed}
        onFocusBranch={noop}
        onPressBranch={noop}
        onClearFocus={noop}
        label={collapseLabel}
      />

      {rows.map((claim, index) => {
        const speakerSpaceId = speakerBySourceBlockId.get(uuidToHex(claim.blockId)) ?? null;
        const isLast = index === rows.length - 1;
        return (
          <div
            key={claim.id}
            className="comment-branch-row relative"
            ref={isLast ? lastRowRef : undefined}
          >
            <div className="comment-branch-row-connectors pointer-events-none absolute inset-0 z-[1]">
              {isLast ? (
                <div
                  className="absolute"
                  style={{ left: `${-(density.bodyInsetPx - density.avatarCenterPx)}px`, top: 0 }}
                >
                  <ThreadElbow density={density} lit={false} />
                </div>
              ) : (
                <ThreadArm density={density} lit={false} />
              )}
            </div>

            <ExtractedClaimRow
              claim={claim}
              debateId={debateId}
              debateSpaceId={spaceId}
              density={density}
              commentCount={commentCounts.get(uuidToHex(claim.id)) ?? 0}
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
          </div>
        );
      })}
    </div>
  );
}

/** The branch has no cross-row highlight of its own yet; the spine still collapses on press. */
function noop() {}

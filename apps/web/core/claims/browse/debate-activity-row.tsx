'use client';

import * as React from 'react';

import cx from 'classnames';

import { useEntityCommentCounts } from '~/core/comments/use-entity-comment-counts';
import type { DebateResponseKind } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useComments } from '~/core/hooks/use-comments';
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
import { ThreadBranch, ThreadBranchRow } from '~/partials/comments/thread-branch-list';
import { ThreadCollapseToggle, ThreadParentSpine } from '~/partials/comments/thread-branch';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ACTIVITY_ROOT_DEPTH } from './claim-activity-depth';
import { orderExtractedClaims } from './claim-activity-order';
import { DebateCommentRow } from './debate-comment-row';
import { ExtractedClaimRow, type SpeakerProfile } from './extracted-claim-row';

/**
 * Geometry for a debate row, which is a comment row with a wider left column.
 *
 * A debate's thumbnail is the still it was published with — 540 × 820, so portrait — and it needs
 * more than a 32px avatar's width to be legible at all. Everything downstream is derived from these
 * numbers rather than assumed, which is what lets the branch beneath reach back to the right place
 * without any of the connector code knowing a debate exists.
 */
const KEYFRAME_WIDTH_PX = 44;
/** The still's own aspect, so it is never letterboxed or cropped. */
const KEYFRAME_HEIGHT_PX = Math.round((KEYFRAME_WIDTH_PX * 820) / 540);
/** Gap between the thumbnail's bottom edge and where its spine starts. */
const SPINE_START_GAP_PX = 4;

const DEBATE_DENSITY: CommentDensity = {
  ...PAGE_DENSITY,
  avatarPx: KEYFRAME_WIDTH_PX,
  avatarCenterPx: KEYFRAME_WIDTH_PX / 2,
  // The same 12px gap a comment puts between its avatar and its text, so the two rows' bodies line
  // up on the left even though their left columns are different widths.
  bodyInsetPx: KEYFRAME_WIDTH_PX + 12,
  headerMinHeightPx: KEYFRAME_HEIGHT_PX,
};

/** How far the branch's connectors reach back to find this row's spine. */
const BRANCH_REACH_PX = DEBATE_DENSITY.bodyInsetPx - DEBATE_DENSITY.avatarCenterPx;

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
};

/**
 * A debate, as a row in the claim's activity feed, with everything it produced hanging off it.
 *
 * Laid out exactly like a comment with replies, because that is what it is: a row, then a branch of
 * rows that belong to it. The spine descends from the thumbnail, the ⊖ threaded onto it closes the
 * branch, and the rows below connect back with the same arms and elbow a reply gets.
 *
 * The thumbnail is the still the debate was published with rather than a mounted player. Three
 * debate rows on a page would otherwise be three `DebateFeedPlayer`s fetching and decoding at once
 * for a reader who is scrolling past all of them; the still costs one image, and Watch is one click.
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
  // Null when no debater profile has resolved yet. Deliberately *not* falling back to `debate.name`:
  // a published debate is named "<claim> | <A> vs. <B>" (#2554), so using it as the byline would
  // print the claim a second time under itself.
  const debaterLine = debaters.length > 0 ? debaters.join(' vs. ') : null;
  // What the debate argued, from its own `Claims` relation. `debate.name` is the last resort and
  // already leads with the claim, so it degrades to roughly the right sentence.
  const headline = claimText ?? debate.name ?? 'Debate';
  const debateHref = NavUtils.toEntity(spaceId, debate.id);

  // Measured from this row's top down to where the branch begins, so the spine stops exactly there
  // rather than guessing at the body's height. Same approach, and the same reason, as `CommentItem`.
  const rowRef = React.useRef<HTMLDivElement>(null);
  const branchRef = React.useRef<HTMLDivElement>(null);
  const [spineHeightPx, setSpineHeightPx] = React.useState<number | null>(null);

  const measureSpine = React.useCallback(() => {
    const row = rowRef.current;
    const branch = branchRef.current;
    if (!row || !branch) {
      setSpineHeightPx(null);
      return;
    }
    // Starts below the thumbnail, so drop that much off its length.
    setSpineHeightPx(
      branch.getBoundingClientRect().top - row.getBoundingClientRect().top - KEYFRAME_HEIGHT_PX - SPINE_START_GAP_PX
    );
  }, []);

  React.useLayoutEffect(() => {
    measureSpine();
    const row = rowRef.current;
    if (row == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureSpine());
    observer.observe(row);
    return () => observer.disconnect();
  });

  const branchLabel = { expand: 'Expand this debate', collapse: 'Collapse this debate' };

  return (
    <div ref={rowRef} className="thread-branch-hover-root relative">
      {!collapsed && (
        <ThreadParentSpine
          leftPx={DEBATE_DENSITY.avatarCenterPx}
          topPx={KEYFRAME_HEIGHT_PX + SPINE_START_GAP_PX}
          heightPx={spineHeightPx}
          lit={false}
          label={branchLabel.collapse}
          onToggle={() => setCollapsed(true)}
        />
      )}

      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-start justify-center" style={{ width: DEBATE_DENSITY.avatarPx }}>
          {collapsed ? (
            <ThreadCollapseToggle collapsed label={branchLabel} onToggle={() => setCollapsed(false)} />
          ) : (
            // Portrait, because that is the shape the video actually is: `Debate videos` declares
            // 540 × 820, so a 16:9 tile would letterbox every still it ever showed.
            <Link
              href={debateHref}
              aria-label={`Watch ${debaterLine ?? headline}`}
              className="relative block w-full shrink-0 overflow-hidden rounded-md bg-grey-01"
              style={{ height: KEYFRAME_HEIGHT_PX }}
            >
              {keyframeUrl && (
                <GeoImage value={keyframeUrl} alt="" fill sizes={`${KEYFRAME_WIDTH_PX}px`} className="object-cover" />
              )}
            </Link>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/*
            The claim leads and the debaters follow, the other way round from the first cut.
            A comment row's strong first line is what was said, and its byline is who said it; a
            debate row reads as a peer of those rows only if it is built the same way. What the
            debate argued is the row's substance — "Ada vs. Tomas" is its byline.
          */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={debateHref} className="group/debate min-w-0 no-underline">
              <span className={cx(PAGE_DENSITY.nameClass, 'wrap-break-word text-text group-hover/debate:underline')}>
                {headline}
              </span>
            </Link>
            <span className={cx(PAGE_DENSITY.metaClass, 'shrink-0 rounded-xs bg-grey-01 px-1.5 py-px text-grey-04')}>
              Debate
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {debaterLine && (
              <span className={cx(PAGE_DENSITY.metaClass, 'min-w-0 truncate text-grey-04')}>{debaterLine}</span>
            )}
            {publishedAt && (
              // Same helper and classes the comment rows use, so a debate and a comment in one
              // thread age identically rather than reading as two lists side by side.
              <span className={cx(PAGE_DENSITY.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
                {getRelativeTime(publishedAt.toISOString())}
              </span>
            )}
          </div>

          <div className="relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
            {!collapsed && (
              <ThreadCollapseToggle
                collapsed={false}
                // Back out of the body box onto the spine, which is what threads the control onto
                // the line rather than leaving it floating beside it.
                leftPx={DEBATE_DENSITY.avatarCenterPx - DEBATE_DENSITY.bodyInsetPx}
                label={branchLabel}
                onToggle={() => setCollapsed(true)}
              />
            )}
            <EntityVoteButtons entityId={debate.id} spaceId={spaceId} responseKind="curation" />
            <EntityCommentsButton
              entityId={debate.id}
              spaceId={spaceId}
              count={debateCommentCount.get(uuidToHex(debate.id)) ?? 0}
            />
            {/* A reply to a debate is a comment on the debate, so it goes where that entity's
                comments already live rather than into this claim's thread. */}
            <button
              type="button"
              data-entity-comments-opener
              onClick={() => openComments(debate.id, spaceId)}
              className={cx(PAGE_DENSITY.metaClass, 'text-grey-04 transition-colors hover:text-text')}
            >
              Reply
            </button>
            <Link
              href={debateHref}
              className={cx(PAGE_DENSITY.metaClass, 'text-ctaPrimary no-underline hover:underline')}
            >
              Watch debate
            </Link>
          </div>

          {!collapsed && (
            <div ref={branchRef} className="mt-4">
              <DebateBranch
                debateId={debate.id}
                spaceId={spaceId}
                profilesBySpaceId={profilesBySpaceId}
                positionBySpaceId={positionBySpaceId}
                responseVocabulary={responseVocabulary}
                onCollapse={() => setCollapsed(true)}
                branchLabel={branchLabel}
                commentCount={debateCommentCount.get(uuidToHex(debate.id)) ?? 0}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Everything that hangs off a debate: the claims it produced, then the comments people left on it.
 *
 * Claims first because they are what the debate *is* — the comments are a reaction to it, and a
 * reaction reads better after the thing it reacts to. Within the claims the order is the order they
 * were said; the comments keep the thread's own newest-first order.
 */
function DebateBranch({
  debateId,
  spaceId,
  profilesBySpaceId,
  positionBySpaceId,
  responseVocabulary,
  onCollapse,
  branchLabel,
  commentCount,
}: {
  debateId: string;
  spaceId: string;
  profilesBySpaceId: Map<string, SpeakerProfile>;
  /** Debater space id (canonical) → the side they argued in this debate. */
  positionBySpaceId: Map<string, boolean>;
  responseVocabulary: DebateResponseKind;
  onCollapse: () => void;
  branchLabel: { expand: string; collapse: string };
  /** From the feed's own aggregate. Zero means there is nothing here worth a request. */
  commentCount: number;
}) {
  const { claims, isLoading } = useDebateTranscriptClaims(debateId, spaceId);
  const { timings, isReady } = useClaimTimings(debateId, claims);
  // The debate's own comments, on the same query key the comments panel uses — so opening the panel
  // on this debate costs no extra request, and a comment posted there appears here too.
  const { comments: debateComments } = useComments({
    entityId: debateId,
    spaceId,
    // Most debates have no comments, and this feed already knows which. Fetching them anyway would
    // be a backlink walk per debate row to discover a list we were told is empty.
    enabled: commentCount > 0,
  });

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

  if (isLoading || !isReady) {
    // Held rather than painted unordered. `isReady` is false only while a timing source is still
    // arriving, and it reports ready on a failed transcript fetch — so this cannot hang forever on
    // a debate whose transcript is gone; that degrades to "all untimed, arrival order".
    return <Skeleton className="h-16 rounded" />;
  }

  // Timed first, in order, then the ones nothing could place. The tail is not sorted among itself:
  // there is nothing to sort it by, and imposing an order would say there was.
  const claimsInOrder = [...ordered.timed, ...ordered.untimed];
  const rowCount = claimsInOrder.length + debateComments.length;

  // Silent rather than apologetic. Claim extraction postdates a chunk of the corpus, so a debate
  // with nothing under it is ordinary — and a line saying so under every old debate is noise.
  if (rowCount === 0) return null;

  return (
    <ThreadBranch rowDensity={PAGE_DENSITY} reachPx={BRANCH_REACH_PX} onCollapse={onCollapse} label={branchLabel}>
      {claimsInOrder.map((claim, index) => {
        const speakerSpaceId = speakerBySourceBlockId.get(uuidToHex(claim.blockId)) ?? null;
        return (
          <ThreadBranchRow key={claim.id} isLast={index === rowCount - 1}>
            <ExtractedClaimRow
              claim={claim}
              debateId={debateId}
              debateSpaceId={spaceId}
              commentCount={commentCounts.get(uuidToHex(claim.id)) ?? 0}
              // A debate is the root of this branch, so everything hanging off it is one below.
              depth={ACTIVITY_ROOT_DEPTH + 1}
              // Stance unless geo-chat says otherwise. A missing row means the space is not indexed,
              // not that the claim is factual, and stance is what the graph defaults to as well.
              responseKind={responseKindByClaimId.get(uuidToHex(claim.id)) ?? 'stance'}
              responseVocabulary={responseVocabulary}
              // A debater who is somehow not recorded on either side gets no tag rather than a
              // guessed one — the same rule the speaker name follows below.
              speakerPosition={
                speakerSpaceId && !claim.restated ? (positionBySpaceId.get(uuidToHex(speakerSpaceId)) ?? null) : null
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
          </ThreadBranchRow>
        );
      })}

      {debateComments.map((comment, index) => (
        <ThreadBranchRow key={comment.id} isLast={claimsInOrder.length + index === rowCount - 1}>
          <DebateCommentRow
            comment={comment}
            targetEntityId={debateId}
            spaceId={spaceId}
            depth={ACTIVITY_ROOT_DEPTH + 1}
          />
        </ThreadBranchRow>
      ))}
    </ThreadBranch>
  );
}

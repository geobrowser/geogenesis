'use client';

import * as React from 'react';

import cx from 'classnames';

import { useEntityCommentCounts } from '~/core/comments/use-entity-comment-counts';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { countFor } from '~/core/hooks/batched-counts';
import { useComments } from '~/core/hooks/use-comments';
import { uuidToHex } from '~/core/id/normalize';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { Warning } from '~/design-system/icons/warning';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { type CommentDensity, PAGE_DENSITY } from '~/partials/comments/comment-density';
import { getRelativeTime } from '~/partials/comments/comment-time';
import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { InlineCommentComposer, useInlineComposer } from '~/partials/comments/inline-comment-composer';
import { ThreadCollapseToggle, ThreadParentSpine, useThreadParentSpine } from '~/partials/comments/thread-branch';
import { ThreadBranch, ThreadBranchRow } from '~/partials/comments/thread-branch-list';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ActivityRowTag } from './activity-row-tag';
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
  /** What the debate argued. The row's body — without it the row is a byline and a control strip. */
  claimText: string | null;
  keyframeUrl: string | null;
  publishedAt: Date | null;
  /**
   * Counted once for every debate on the page rather than per row.
   *
   * Both used to be read here: the comments through a batched hook handed one id, which is a request
   * each, and the claims through this debate's transcript — the expensive read the collapse control
   * exists to avoid, running whether or not the row was expanded.
   *
   * `null` means the aggregate could not answer, and the row then assumes there is something here —
   * otherwise one failed request turns every debate on the page into a dead end.
   */
  commentCount: number | null;
  claimCount: number | null;
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
  claimText,
  keyframeUrl,
  publishedAt,
  commentCount,
  claimCount,
}: DebateActivityRowProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const composer = useInlineComposer();
  // One aggregate for this row's own comment count. Without it the button seeds itself at zero and
  // only ever corrects downward, so a debate with comments read "0" until the panel was opened.

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

  // Below the thumbnail rather than `avatarBottomInRowPx`: this row's left column is a keyframe, not
  // an avatar, so its own height is where the spine starts.
  const spine = useThreadParentSpine(KEYFRAME_HEIGHT_PX + SPINE_START_GAP_PX);

  const branchLabel = { expand: 'Expand this debate', collapse: 'Collapse this debate' };

  // A debate with no claims and no comments has no branch: `DebateBranch` returns null for it. The
  // collapse control was drawn anyway, so pressing it on a transcript-less debate collapsed nothing
  // and merely swapped the keyframe for a plus. `composer.hasPosted` as well as the two counts,
  // because a comment written here is a branch the server aggregate has not heard about yet.
  //
  // A count of `null` is an aggregate that failed, not an empty debate, so it opens the branch: the
  // worst case is that toggle with nothing under it again, against losing every extracted claim and
  // every comment on the page with no way to ask for them.
  const countsUnknown = claimCount == null || commentCount == null;
  const hasBranch = countsUnknown || claimCount + commentCount > 0 || composer.hasPosted;

  return (
    <div ref={spine.rowRef} className="thread-branch-hover-root relative">
      {hasBranch && !collapsed && (
        <ThreadParentSpine
          leftPx={DEBATE_DENSITY.avatarCenterPx}
          topPx={spine.topPx}
          heightPx={spine.heightPx}
          lit={false}
          label={branchLabel.collapse}
          onToggle={() => setCollapsed(true)}
        />
      )}

      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-start justify-center" style={{ width: DEBATE_DENSITY.avatarPx }}>
          {hasBranch && collapsed ? (
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
            Built like every other row in the thread: who, then what, then what you can do about it.
            The debaters are this row's byline the way a commenter's name is theirs, and the claim
            the debate argued is its body — so the header carries the names, the kind tag and the
            age, and the sentence sits underneath on its own line.

            An earlier cut led with the claim and dropped the debaters to a second line. It read as a
            headline with a credit under it, which is a different shape from the rows above and below
            it, and the eye had to find a new place to look for "who" on every other row.
          */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {debaterLine && (
              // The byline is the link, the way a commenter's name is. What the debate argued is
              // this row's text, and text that navigates when you touch it is a trap in a thread
              // where every neighbouring sentence is inert — a reader selecting a phrase to quote
              // from a claim row does not expect the one below it to leave the page.
              <Link
                href={debateHref}
                aria-label={`Watch ${debaterLine}`}
                className={cx(PAGE_DENSITY.nameClass, 'min-w-0 truncate text-text no-underline hover:underline')}
              >
                {debaterLine}
              </Link>
            )}
            <ActivityRowTag kind="debate" />
            {publishedAt && (
              // Same helper and classes the comment rows use, so a debate and a comment in one
              // thread age identically rather than reading as two lists side by side.
              <span className={cx(PAGE_DENSITY.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
                {getRelativeTime(publishedAt.toISOString())}
              </span>
            )}
          </div>

          <span className={cx(PAGE_DENSITY.bodyClass, 'wrap-break-word text-text')}>{headline}</span>

          <div className="relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
            {hasBranch && !collapsed && (
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
            {/* Claims before comments, because the claims are what the debate produced and the
                comments are what happened afterwards — the same order the branch draws them in. Not
                a control: the rows are already below, and the collapse toggle on the spine is how
                you hide them. */}
            {/* Omitted rather than shown as "0" when the aggregate could not answer: the branch below
                is drawing whatever is actually there, and a zero beside it would contradict it. */}
            {claimCount != null && (
              <span
                className={cx(PAGE_DENSITY.metaClass, 'inline-flex items-center gap-1.5 text-grey-04')}
                aria-label={`${claimCount} extracted ${claimCount === 1 ? 'claim' : 'claims'}`}
              >
                <Warning size={12} />
                <span className="text-[14px] font-normal tabular-nums">{claimCount}</span>
              </span>
            )}
            <EntityCommentsButton
              entityId={debate.id}
              spaceId={spaceId}
              targetEntityType="debate"
              // Zero when unknown, which is what every other host of this button passes when it has
              // no count to give: the button corrects upward from its own list, so it understates
              // rather than hiding anything.
              count={commentCount ?? 0}
              // The only way into the composer now that Reply is gone: two controls opening one box
              // was one control too many, and the count already says what the box is for. A comment
              // here is filed against the debate, not against this claim, but it is written and read
              // in place rather than in a panel that hides the branch to collect it.
              onActivate={composer.toggle}
              isActive={composer.isComposing}
            />
            <Link
              href={debateHref}
              className={cx(PAGE_DENSITY.metaClass, 'text-ctaPrimary no-underline hover:underline')}
            >
              Watch debate
            </Link>
          </div>

          <InlineCommentComposer
            composer={composer}
            targetEntityId={debate.id}
            targetSpaceId={spaceId}
            targetEntityType="debate"
            placeholder="Comment on this debate..."
          />

          {hasBranch && !collapsed && (
            <div ref={spine.branchRef} className="mt-4">
              <DebateBranch
                debateId={debate.id}
                spaceId={spaceId}
                profilesBySpaceId={profilesBySpaceId}
                positionBySpaceId={positionBySpaceId}
                onCollapse={() => setCollapsed(true)}
                branchLabel={branchLabel}
                commentCount={commentCount}
                hasPostedHere={composer.hasPosted}
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
  onCollapse,
  branchLabel,
  commentCount,
  hasPostedHere,
}: {
  debateId: string;
  spaceId: string;
  profilesBySpaceId: Map<string, SpeakerProfile>;
  /** Debater space id (canonical) → the side they argued in this debate. */
  positionBySpaceId: Map<string, boolean>;
  onCollapse: () => void;
  branchLabel: { expand: string; collapse: string };
  /** From the feed's own aggregate. Zero means nothing here is worth a request; `null` means it could not say. */
  commentCount: number | null;
  /** Someone has commented from this row since the page loaded, so the aggregate is behind. */
  hasPostedHere: boolean;
}) {
  const { claims, isLoading, error: claimsError, retry: retryClaims } = useDebateTranscriptClaims(debateId, spaceId);
  const { timings, isReady } = useClaimTimings(debateId, claims);
  // The debate's own comments, on the same query key the comments panel uses — so opening the panel
  // on this debate costs no extra request, and a comment posted there appears here too.
  const { comments: debateComments } = useComments({
    entityId: debateId,
    spaceId,
    // Most debates have no comments, and this feed already knows which. Fetching them anyway would
    // be a backlink walk per debate row to discover a list we were told is empty. A comment made
    // from this row makes that aggregate stale, so it also lifts the gate — otherwise the first
    // comment on a silent debate would be written and never read back. So does an aggregate that
    // failed (`null`): "we could not ask" is not "there is nothing to fetch".
    enabled: commentCount == null || commentCount > 0 || hasPostedHere,
  });

  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  const commentCounts = useEntityCommentCounts(claimIds);

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

  // The claims could not be read, so the branch owes the reader an account of what it is not showing.
  //
  // Silence is right for a debate that simply has nothing under it — claim extraction postdates a
  // chunk of the corpus, and a line saying so beneath every old debate is noise — and the hook reports
  // a failure as the same empty grouping, so the two have to be told apart here. The first version of
  // this only spoke up when the *whole* branch was empty, which meant a debate that also had comments
  // drew them and dropped its failed claims without a word, under a row still advertising eighteen.
  const claimsFailed = claimsError != null && claimsInOrder.length === 0;
  // One row, at the head: it is about the claims, which is what the rest of the branch leads with.
  const leadingRows = claimsFailed ? 1 : 0;
  const rowCount = leadingRows + claimsInOrder.length + debateComments.length;

  if (rowCount === 0) return null;

  return (
    <ThreadBranch rowDensity={PAGE_DENSITY} reachPx={BRANCH_REACH_PX} onCollapse={onCollapse} label={branchLabel}>
      {claimsFailed && (
        <ThreadBranchRow isLast={rowCount === 1}>
          <span className={cx(PAGE_DENSITY.metaClass, 'text-grey-04')}>
            Couldn’t load the claims from this debate.{' '}
            <button type="button" onClick={retryClaims} className="text-ctaPrimary hover:underline">
              Try again
            </button>
          </span>
        </ThreadBranchRow>
      )}

      {claimsInOrder.map((claim, index) => {
        const speakerSpaceId = speakerBySourceBlockId.get(uuidToHex(claim.blockId)) ?? null;
        return (
          <ThreadBranchRow key={claim.id} isLast={leadingRows + index === rowCount - 1}>
            <ExtractedClaimRow
              claim={claim}
              debateId={debateId}
              debateSpaceId={spaceId}
              // Null when this aggregate failed, so the claim still offers its comments — the same
              // rule the debate row above follows for its own counts.
              commentCount={countFor(commentCounts, claim.id)}
              // A debate is the root of this branch, so everything hanging off it is one below.
              depth={ACTIVITY_ROOT_DEPTH + 1}
              // Known rather than looked up. Every extracted claim is a Claim entity, and #2541
              // answered every claim with Agree/Disagree — so `stance` is the only kind a claim has,
              // and stating it saves the per-entity read the control would otherwise make to find out.
              //
              // This was a batched geo-chat lookup per page, guarded against ever guessing an answer
              // it had not received, because publishing a stance vote on a veracity claim wrote the
              // wrong kind of response. That distinction no longer exists: the `veracity` kind, its
              // vote kind and its SDK methods are gone, so there is one answer and nothing to guess.
              responseKind="stance"
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
        <ThreadBranchRow key={comment.id} isLast={leadingRows + claimsInOrder.length + index === rowCount - 1}>
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

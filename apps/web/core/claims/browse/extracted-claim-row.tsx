'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateResponseKind } from '~/core/debates/api';
import { useOpenDebaterProfile } from '~/core/debates/browse/use-open-debater-profile';
import { formatTimecode, isAssertableMoment } from '~/core/debates/claim-timing';
import { debateSeekSeconds, withDebateTimecode } from '~/core/debates/debate-timecode';
import { useComments } from '~/core/hooks/use-comments';
import type { ResponseKind } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import {
  type CommentDensity,
  PAGE_DENSITY,
  avatarBottomInRowPx,
  threadSpineOffsetPx,
} from '~/partials/comments/comment-density';
import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { InlineCommentComposer, useInlineComposer } from '~/partials/comments/inline-comment-composer';
import { ThreadAvatar } from '~/partials/comments/thread-avatar';
import { ThreadCollapseToggle, ThreadParentSpine, useThreadParentSpine } from '~/partials/comments/thread-branch';
import { ThreadBranch, ThreadBranchRow } from '~/partials/comments/thread-branch-list';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ActivityRowTag } from './activity-row-tag';
import { canNestBelow } from './claim-activity-depth';
import type { OrderedTranscriptClaim } from './claim-activity-order';
import { ClaimCommentPositionBoundary, ResponsePositionTag } from './claim-comment-position';
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
  const [commentsCollapsed, setCommentsCollapsed] = React.useState(false);

  // Starts at the avatar's bottom edge, which is what `avatarBottomInRowPx` already means and what
  // the comment rows already use — so a claim's spine and a comment's leave from the same place.
  const spine = useThreadParentSpine(avatarBottomInRowPx(density));

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

  const hasComments = Boolean(claimSpaceId) && (commentCount > 0 || composer.hasPosted) && canNestBelow(depth);
  const branchLabel = { expand: 'Show comments on this claim', collapse: 'Hide comments on this claim' };

  return (
    // `gap-3` is the comment header's own 12px avatar gap, so a claim row and a comment row put
    // their text on the same left edge.
    <div ref={spine.rowRef} className={cx('thread-branch-hover-root relative flex min-w-0 gap-3', className)}>
      {/* The line from this claim's face down to the comments hanging off it. Without it the branch
          below draws an elbow reaching back to a spine that was never there — an arm pointing at
          nothing, which is what a reader sees as a broken connector. */}
      {hasComments && !commentsCollapsed && (
        <ThreadParentSpine
          leftPx={density.avatarCenterPx}
          topPx={spine.topPx}
          heightPx={spine.heightPx}
          lit={false}
          label={branchLabel.collapse}
          onToggle={() => setCommentsCollapsed(true)}
        />
      )}
      {/* The frame is the link rather than sitting inside one: an anchor wrapping a sized span makes
          the anchor the flex item and leaves the span inline, which is how a 987px face ended up in
          a 32px row. `self-start` keeps it on the name's line instead of centred against a row whose
          height includes everything nested under it. */}
      <ThreadAvatar
        href={speaker ? NavUtils.toSpace(speaker.spaceId) : undefined}
        onClick={speaker ? openSpeakerProfile : undefined}
        avatarUrl={speaker?.avatarUrl ?? null}
        value={speaker?.spaceId}
        sizePx={density.avatarPx}
        className="self-start"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <SpeakerLink speaker={speaker} onOpenProfile={openSpeakerProfile}>
            <span className={cx(density.nameClass, 'truncate text-text')}>
              {speaker?.name?.trim() || 'Unnamed debater'}
            </span>
          </SpeakerLink>

          {/* The side first, then what kind of row this is. The side belongs to the person whose
              name it follows; the kind belongs to the row. Reading them the other way round put a
              label about the row between a name and the fact about that name. */}
          {speakerPosition !== null && (
            <ResponsePositionTag
              responseKind={responseVocabulary}
              position={speakerPosition}
              title={`Argued this side in the debate: ${claim.text}`}
            />
          )}

          <ActivityRowTag kind="claim" />

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
          <div className="relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
            {hasComments && (
              <ThreadCollapseToggle
                collapsed={commentsCollapsed}
                // Back out of the body box onto the spine, so the control sits on the line rather
                // than beside it.
                leftPx={density.avatarCenterPx - density.bodyInsetPx}
                label={branchLabel}
                onToggle={() => setCommentsCollapsed(collapsed => !collapsed)}
              />
            )}
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

        {claimSpaceId && (
          <InlineCommentComposer
            composer={composer}
            targetEntityId={claim.id}
            targetSpaceId={claimSpaceId}
            targetEntityType="claim"
            placeholder="Comment on this claim..."
          />
        )}

        {/* `composer.hasPosted` as well as the server count: the aggregate that gates this is from
            the page load, so a reader's first comment on a silent claim would otherwise be written
            and then not drawn. */}
        {hasComments && !commentsCollapsed && (
          <div ref={spine.branchRef} className="mt-3">
            <ClaimComments
              claimId={claim.id}
              spaceId={claimSpaceId!}
              depth={depth + 1}
              onCollapse={() => setCommentsCollapsed(true)}
              label={branchLabel}
            />
          </div>
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
 *
 * The boundary re-roots the position badge on *this* claim. A comment here sits under this claim's
 * sentence, so the badge beside its author has to be about this claim — otherwise it reports the
 * page's claim, several screens up, and can say "Agree" over a comment arguing the opposite. It is
 * inside the same gate, so it costs a responder read only where there is a comment to badge.
 */
function ClaimComments({
  claimId,
  spaceId,
  depth,
  onCollapse,
  label,
}: {
  claimId: string;
  spaceId: string;
  depth: number;
  /**
   * Collapses the branch, and — separately from that — is what makes the branch draw its spine.
   *
   * `ThreadBranch` gates the spine on having something to collapse, so a branch passed neither drew
   * arms reaching back to a line that did not exist. Every other branch in this feed supplies both.
   */
  onCollapse: () => void;
  label: { expand: string; collapse: string };
}) {
  const { comments } = useComments({ entityId: claimId, spaceId });
  if (comments.length === 0) return null;

  return (
    // No wrapper of its own. The caller measures where this branch begins in order to stop the spine
    // coming down from the avatar exactly there, and a margin *inside* the measured element is 12px
    // the spine never covers — the break a reader sees between the control and the first elbow.
    // One element, carrying the margin, measured by the caller.
    <ClaimCommentPositionBoundary entityId={claimId} spaceId={spaceId}>
      <ThreadBranch
        rowDensity={PAGE_DENSITY}
        reachPx={threadSpineOffsetPx(PAGE_DENSITY)}
        onCollapse={onCollapse}
        label={label}
      >
        {comments.map((comment, index) => (
          <ThreadBranchRow key={comment.id} isLast={index === comments.length - 1}>
            <DebateCommentRow comment={comment} targetEntityId={claimId} spaceId={spaceId} depth={depth} />
          </ThreadBranchRow>
        ))}
      </ThreadBranch>
    </ClaimCommentPositionBoundary>
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
 * The name only. The face is its own link — see `ThreadAvatar`, which is the frame rather than
 * something wrapped around one, because an anchor around a sized frame is what made a 987px face
 * render in a 32px row.
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
      className={cx('min-w-0 truncate no-underline hover:underline', className)}
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

'use client';

import * as React from 'react';

import cx from 'classnames';

import { Warning } from '~/design-system/icons/warning';
import { Text } from '~/design-system/text';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { Comment, Share } from './icons';

type InteractionBarProps = {
  orientation: 'vertical' | 'horizontal';
  entityId: string;
  spaceId: string;
  commentCount: number;
  onComment: () => void;
  /**
   * Open state of the comments surface when comments open somewhere this bar doesn't own — the
   * explore card routes them to the app's global comments panel. That panel recognises its own
   * openers by `data-entity-comments-opener`, so without this the pill would read as an outside
   * click and dismiss the panel instead of switching it to this debate. Left undefined by the
   * full-screen feed, which opens a panel it controls itself.
   */
  commentsPanelOpen?: boolean;
  /**
   * Claims and Share are omitted together while a surface is still resolving its debate — the
   * explore card renders the bar before the geo-chat lookups land, and neither control can act
   * without a debate to act on.
   */
  claimsCount?: number;
  onClaims?: () => void;
  onShare?: () => void;
  shareOpen?: boolean;
  className?: string;
};

/**
 * The upvote/downvote/comment/claims/share bar beside each debate. Entity votes
 * use the same persisted response path as gallery and entity-page vote controls.
 *
 * Shared by both renditions of a debate — the full-screen feed and the explore card — so the two
 * present the same score, counts and controls rather than two spellings of them (GEO-2912).
 */
export function DebateInteractionBar({
  orientation,
  entityId,
  spaceId,
  commentCount,
  commentsPanelOpen,
  claimsCount,
  onComment,
  onClaims,
  onShare,
  shareOpen,
  className,
}: InteractionBarProps) {
  // Defined at all means comments open in the app's global panel rather than in one this bar's
  // host owns, which is what makes this control one of that panel's openers. Named once so the two
  // orientations below can't disagree about what the prop means.
  const opensGlobalCommentsPanel = commentsPanelOpen !== undefined;

  // The counts are said, not just shown. `aria-label` replaces a control's visible text for a
  // screen reader, and the visible text on these two is the number — so labelling them "Comments"
  // and "Claims" is the one reading that drops the thing they are there to report. Counted the way
  // `EntityCommentsButton` counts, which is the control the explore card used before this one.
  const commentsLabel = `Comments (${commentCount})`;
  const claimsLabel = `Claims (${claimsCount ?? 0})`;

  if (orientation === 'vertical') {
    return (
      <div className={cx('flex w-9 flex-col items-center gap-3', className)}>
        <EntityVoteButtons
          entityId={entityId}
          spaceId={spaceId}
          responseKind="curation"
          presentation="debate-vertical"
        />
        <CircleAction
          label={String(commentCount)}
          onClick={onComment}
          icon={<Comment />}
          ariaLabel={commentsLabel}
          expanded={commentsPanelOpen}
          commentsPanelOpener={opensGlobalCommentsPanel}
        />
        {onClaims && (
          <CircleAction
            label={String(claimsCount ?? 0)}
            onClick={onClaims}
            icon={<Warning />}
            ariaLabel={claimsLabel}
          />
        )}
        {onShare && (
          <CircleAction
            label="Share"
            onClick={onShare}
            icon={<Share />}
            ariaLabel="Share debate"
            expanded={shareOpen}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cx('flex w-full items-center gap-2', className)}>
      <EntityVoteButtons
        entityId={entityId}
        spaceId={spaceId}
        responseKind="curation"
        presentation="debate-horizontal"
      />
      <PillAction
        onClick={onComment}
        icon={<Comment />}
        label={String(commentCount)}
        ariaLabel={commentsLabel}
        expanded={commentsPanelOpen}
        commentsPanelOpener={opensGlobalCommentsPanel}
      />
      {onClaims && (
        <PillAction onClick={onClaims} icon={<Warning />} label={String(claimsCount ?? 0)} ariaLabel={claimsLabel} />
      )}
      {onShare && (
        <PillAction onClick={onShare} icon={<Share />} label="Share" ariaLabel="Share debate" expanded={shareOpen} />
      )}
    </div>
  );
}

function CircleAction({
  label,
  icon,
  onClick,
  ariaLabel,
  expanded,
  commentsPanelOpener,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  // When set, the button opens a dialog — announce that and its open/closed state to screen readers,
  // which Radix would do via <Trigger> if the trigger lived in the sheet's own subtree.
  expanded?: boolean;
  // See {@link InteractionBarProps.commentsPanelOpen}: marks this button to the global comments
  // panel as one of its openers.
  commentsPanelOpener?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup={expanded === undefined ? undefined : 'dialog'}
        aria-expanded={expanded}
        data-entity-comments-opener={commentsPanelOpener ? '' : undefined}
        onClick={onClick}
        className="grid size-9 place-items-center rounded-full border border-grey-02 bg-white text-grey-04 shadow-light transition-colors hover:text-text"
      >
        {icon}
      </button>
      <Text as="span" variant="tag" color="grey-04" className="tabular-nums">
        {label}
      </Text>
    </div>
  );
}

function PillAction({
  label,
  icon,
  onClick,
  ariaLabel,
  expanded,
  commentsPanelOpener,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  // See {@link CircleAction}: announces the dialog and its open state when this button opens one.
  expanded?: boolean;
  // See {@link CircleAction}.
  commentsPanelOpener?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-expanded={expanded}
      data-entity-comments-opener={commentsPanelOpener ? '' : undefined}
      onClick={onClick}
      className={cx(
        'flex h-7 items-center gap-1.5 rounded-full border border-grey-02 bg-white px-2.5 text-grey-04 shadow-light transition-colors hover:text-text',
        className
      )}
    >
      <span className="text-text">{icon}</span>
      <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
        {label}
      </Text>
    </button>
  );
}

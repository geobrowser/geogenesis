'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { Comment, Share } from './icons';
import { PILL_ACTION_CLASS } from './pill-action';

type InteractionBarProps = {
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
   * Omitted while a surface is still resolving its debate — the explore card renders the bar before
   * the geo-chat lookups land, and Share cannot act without a debate to act on.
   */
  onShare?: () => void;
  shareOpen?: boolean;
  /**
   * The debate's overflow menu, drawn last. Its host decides what is in it and whether it is drawn
   * at all — today only the full-screen feed's Remove debate (GEO-2785), for the few who may.
   */
  overflow?: React.ReactNode;
  className?: string;
};

type DebateActionKind = 'comments' | 'share';

function debateActionAnalyticsProps(actionKind: DebateActionKind) {
  return {
    'data-geo-analytics-label': `Debate ${actionKind}`,
    'data-geo-analytics-intent': 'debate_action',
  } as const;
}

/**
 * The debate's own actions on its card: comments and share. They sit at the end of the claim's
 * Agree/Disagree row (`DebateClaimFooter`), which replaced the debate's up/down vote (GEO-3454).
 *
 * Shared by both renditions of a debate — the full-screen feed and the explore card — so the two
 * present the same counts and controls rather than two spellings of them (GEO-2912).
 */
export function DebateInteractionBar({
  commentCount,
  commentsPanelOpen,
  onComment,
  onShare,
  shareOpen,
  overflow,
  className,
}: InteractionBarProps) {
  // The count is said, not just shown. `aria-label` replaces a control's visible text for a screen
  // reader, and the visible text here is the number — so labelling it "Comments" is the one reading
  // that drops the thing it is there to report. Counted the way `EntityCommentsButton` counts.
  const commentsLabel = `Comments (${commentCount})`;

  return (
    <div className={cx('flex items-center gap-2', className)}>
      <PillAction
        onClick={onComment}
        icon={<Comment />}
        label={String(commentCount)}
        ariaLabel={commentsLabel}
        actionKind="comments"
        open={commentsPanelOpen}
        // Defined at all means comments open in the app's global panel rather than in one this
        // bar's host owns, which is what makes this control one of that panel's openers.
        commentsPanelOpener={commentsPanelOpen !== undefined}
      />
      {onShare && (
        <PillAction
          onClick={onShare}
          icon={<Share />}
          label="Share"
          ariaLabel="Share debate"
          actionKind="share"
          expanded={shareOpen}
          // The row shares its width with Agree and Disagree, whose labels are the ones that must
          // stay whole. Read against the row's own container, not the viewport: the same card is a
          // 320px explore column and a 640px full-screen one.
          collapsesLabel
        />
      )}
      {overflow}
    </div>
  );
}

function PillAction({
  label,
  icon,
  onClick,
  ariaLabel,
  actionKind,
  expanded,
  open,
  commentsPanelOpener,
  collapsesLabel = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  /** Stable analytics dimension; unlike the accessible label it deliberately excludes live counts. */
  actionKind: DebateActionKind;
  // When set, the button opens a dialog — announce that and its open/closed state to screen readers,
  // which Radix would do via <Trigger> if the trigger lived in the sheet's own subtree.
  expanded?: boolean;
  /**
   * Open/closed state for a control whose surface is *not* a dialog, so it gets `aria-expanded`
   * without `aria-haspopup`. The app's comments panel is an in-flow panel with no dialog role and
   * no focus trap, and `EntityCommentsButton` — the control this replaced on explore cards —
   * announced exactly this much. Promising a dialog sends a screen reader looking for one.
   */
  open?: boolean;
  // See {@link InteractionBarProps.commentsPanelOpen}: marks this button to the global comments
  // panel as one of its openers.
  commentsPanelOpener?: boolean;
  /** Drop to the icon alone in a narrow container; the accessible label still names the action. */
  collapsesLabel?: boolean;
}) {
  return (
    <button
      type="button"
      {...debateActionAnalyticsProps(actionKind)}
      aria-label={ariaLabel}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-expanded={expanded ?? open}
      data-entity-comments-opener={commentsPanelOpener ? '' : undefined}
      onClick={onClick}
      className={cx(
        PILL_ACTION_CLASS,
        'gap-1.5 px-2.5',
        collapsesLabel && '@max-[400px]:size-7 @max-[400px]:justify-center @max-[400px]:px-0'
      )}
    >
      <span className="text-text">{icon}</span>
      <Text
        as="span"
        variant="metadataMedium"
        color="text"
        className={cx('tabular-nums', collapsesLabel && '@max-[400px]:hidden')}
      >
        {label}
      </Text>
    </button>
  );
}

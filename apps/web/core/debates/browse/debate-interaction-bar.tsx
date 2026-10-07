'use client';

import * as React from 'react';

import cx from 'classnames';

import { DebateRoundPips, rebuttalRoundsLabel } from '~/core/debates/debate-round-indicator';
import type { ResponseKind } from '~/core/responses/entity-response';

import { Warning } from '~/design-system/icons/warning';
import { Text } from '~/design-system/text';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { Comment, Share } from './icons';
import { CIRCLE_ACTION_CLASS, CIRCLE_SHAPE_CLASS, PILL_ACTION_CLASS, PILL_SHAPE_CLASS } from './pill-action';

type InteractionBarProps = {
  orientation: 'vertical' | 'horizontal';
  /** Tighten horizontal pills for constrained card surfaces without changing their actions. */
  compact?: boolean;
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
  /**
   * Rebuttal rounds an Open rounds debate unlocked (GEO-3180), from `openRebuttalRoundCount`. Shown
   * only above zero: a debate that ended after the opening, and every fixed format, show nothing.
   */
  rebuttalRounds?: number | null;
  /**
   * What kind of response the vote control records, or `'infer'` to let `EntityVoteButtons` read
   * it off the entity.
   *
   * Not just a kind: naming one skips that component's entity lookup, and with it
   * `resolveEntitySpaceId`, which is what diverts counts and votes to the space an entity actually
   * lives in when the surface is listing it from somewhere else (GEO-2660). The full-screen feed
   * only ever shows a space its own debates, so it keeps the cheaper fixed kind. An explore card
   * can be a data block row listing a debate from another space, where the fixed kind reads that
   * row's votes against the listing space and finds none — so it asks for the lookup.
   *
   * A debate infers to `'curation'` either way, so this changes which space is read, not what the
   * control looks like.
   */
  responseKind?: ResponseKind | 'infer';
  /**
   * The debate's overflow menu, drawn last. Its host decides what is in it and whether it is drawn
   * at all — today only the full-screen feed's Remove debate (GEO-2785), for the few who may.
   */
  overflow?: React.ReactNode;
  className?: string;
};

type DebateActionKind = 'comments' | 'claims' | 'share';

function debateActionAnalyticsProps(actionKind: DebateActionKind) {
  return {
    'data-geo-analytics-label': `Debate ${actionKind}`,
    'data-geo-analytics-intent': 'debate_action',
  } as const;
}

/**
 * The upvote/downvote/comment/claims/share bar beside each debate. Entity votes
 * use the same persisted response path as gallery and entity-page vote controls.
 *
 * Shared by both renditions of a debate — the full-screen feed and the explore card — so the two
 * present the same score, counts and controls rather than two spellings of them (GEO-2912).
 */
export function DebateInteractionBar({
  orientation,
  compact = false,
  entityId,
  spaceId,
  commentCount,
  commentsPanelOpen,
  claimsCount,
  onComment,
  onClaims,
  onShare,
  shareOpen,
  rebuttalRounds,
  responseKind = 'curation',
  overflow,
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
  const voteResponseKind = responseKind === 'infer' ? undefined : responseKind;

  const commentsLabel = `Comments (${commentCount})`;
  const claimsLabel = `Claims (${claimsCount ?? 0})`;
  const rounds = rebuttalRounds != null && rebuttalRounds > 0 ? rebuttalRounds : null;

  if (orientation === 'vertical') {
    return (
      <div className={cx('flex w-9 flex-col items-center gap-3', className)}>
        <EntityVoteButtons
          entityId={entityId}
          spaceId={spaceId}
          responseKind={voteResponseKind}
          presentation="debate-vertical"
        />
        <CircleAction
          label={String(commentCount)}
          onClick={onComment}
          icon={<Comment />}
          ariaLabel={commentsLabel}
          actionKind="comments"
          open={commentsPanelOpen}
          commentsPanelOpener={opensGlobalCommentsPanel}
        />
        {onClaims && (
          <CircleAction
            label={String(claimsCount ?? 0)}
            onClick={onClaims}
            icon={<Warning />}
            ariaLabel={claimsLabel}
            actionKind="claims"
          />
        )}
        {onShare && (
          <CircleAction
            label="Share"
            onClick={onShare}
            icon={<Share />}
            ariaLabel="Share debate"
            actionKind="share"
            expanded={shareOpen}
          />
        )}
        {rounds !== null && <RoundsIndicator rounds={rounds} orientation="vertical" />}
        {overflow}
      </div>
    );
  }

  return (
    <div className={cx('flex w-full items-center gap-2', className)}>
      <EntityVoteButtons
        entityId={entityId}
        spaceId={spaceId}
        responseKind={voteResponseKind}
        presentation="debate-horizontal"
      />
      <PillAction
        onClick={onComment}
        icon={<Comment />}
        label={String(commentCount)}
        ariaLabel={commentsLabel}
        actionKind="comments"
        open={commentsPanelOpen}
        commentsPanelOpener={opensGlobalCommentsPanel}
        compact={compact}
      />
      {onClaims && (
        <PillAction
          onClick={onClaims}
          icon={<Warning />}
          label={String(claimsCount ?? 0)}
          ariaLabel={claimsLabel}
          actionKind="claims"
          compact={compact}
        />
      )}
      {onShare && (
        <PillAction
          onClick={onShare}
          icon={<Share />}
          label="Share"
          ariaLabel="Share debate"
          actionKind="share"
          expanded={shareOpen}
          compact={compact}
          hideLabel={compact}
        />
      )}
      {rounds !== null && <RoundsIndicator rounds={rounds} orientation="horizontal" compact={compact} />}
      {overflow}
    </div>
  );
}

/** A horizontal pill's padding, shared by the actions and the rounds pill so they line up. */
function pillPaddingClass(compact: boolean) {
  return compact ? 'gap-1 px-1.5' : 'gap-1.5 px-2.5';
}

/**
 * How far the debate went (GEO-3180). Not an action, so a plain element cut to the actions' shape
 * rather than a button, in purple to read as the debate's result rather than a control. The
 * visible text is shorthand, so readers get {@link rebuttalRoundsLabel} instead, the way the room's
 * round counter does it.
 */
function RoundsIndicator({
  rounds,
  orientation,
  compact = false,
}: {
  rounds: number;
  orientation: 'vertical' | 'horizontal';
  compact?: boolean;
}) {
  const label = <span className="sr-only">{rebuttalRoundsLabel(rounds)}</span>;

  if (orientation === 'vertical') {
    return (
      <div data-debate-rounds={rounds} className="flex flex-col items-center gap-1">
        <span aria-hidden="true" className={cx(CIRCLE_SHAPE_CLASS, 'border-purple/35')}>
          <Text as="span" variant="metadataMedium" color="purple" className="tabular-nums">
            {rounds}
          </Text>
        </span>
        <Text as="span" variant="tag" color="grey-04" aria-hidden="true">
          {rounds === 1 ? 'Round' : 'Rounds'}
        </Text>
        {label}
      </div>
    );
  }

  return (
    <span
      data-debate-rounds={rounds}
      className={cx(PILL_SHAPE_CLASS, 'shrink-0 border-purple/35 text-purple', pillPaddingClass(compact))}
    >
      {!compact && <DebateRoundPips rounds={rounds} />}
      <Text
        as="span"
        variant="metadataMedium"
        color="purple"
        className="whitespace-nowrap tabular-nums"
        aria-hidden="true"
      >
        {rounds === 1 ? '1 round' : `${rounds} rounds`}
      </Text>
      {label}
    </span>
  );
}

function CircleAction({
  label,
  icon,
  onClick,
  ariaLabel,
  actionKind,
  expanded,
  open,
  commentsPanelOpener,
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
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        {...debateActionAnalyticsProps(actionKind)}
        aria-label={ariaLabel}
        aria-haspopup={expanded === undefined ? undefined : 'dialog'}
        aria-expanded={expanded ?? open}
        data-entity-comments-opener={commentsPanelOpener ? '' : undefined}
        onClick={onClick}
        className={CIRCLE_ACTION_CLASS}
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
  actionKind,
  expanded,
  open,
  commentsPanelOpener,
  compact = false,
  hideLabel = false,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  /** Stable analytics dimension; unlike the accessible label it deliberately excludes live counts. */
  actionKind: DebateActionKind;
  // See {@link CircleAction}: announces the dialog and its open state when this button opens one.
  expanded?: boolean;
  // See {@link CircleAction}.
  open?: boolean;
  // See {@link CircleAction}.
  commentsPanelOpener?: boolean;
  compact?: boolean;
  /** Keep an icon-only action when its accessible label already communicates the action. */
  hideLabel?: boolean;
  className?: string;
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
        compact && hideLabel ? 'size-7 justify-center px-0' : pillPaddingClass(compact),
        className
      )}
    >
      <span className="text-text">{icon}</span>
      {!hideLabel ? (
        <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
          {label}
        </Text>
      ) : null}
    </button>
  );
}

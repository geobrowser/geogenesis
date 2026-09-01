'use client';

import * as React from 'react';

import cx from 'classnames';

import { InfoSmall } from '~/design-system/icons/info-small';
import { Text } from '~/design-system/text';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { Comment, Share } from './icons';

type InteractionBarProps = {
  orientation: 'vertical' | 'horizontal';
  entityId: string;
  spaceId: string;
  commentCount: number;
  claimsCount: number;
  onComment: () => void;
  onClaims: () => void;
  onShare: () => void;
  shareOpen: boolean;
  className?: string;
};

/**
 * The upvote/downvote/comment/claims/share bar beside each debate. Entity votes
 * use the same persisted response path as gallery and entity-page vote controls.
 */
export function DebateInteractionBar({
  orientation,
  entityId,
  spaceId,
  commentCount,
  claimsCount,
  onComment,
  onClaims,
  onShare,
  shareOpen,
  className,
}: InteractionBarProps) {
  if (orientation === 'vertical') {
    return (
      <div className={cx('flex w-9 flex-col items-center gap-3', className)}>
        <EntityVoteButtons
          entityId={entityId}
          spaceId={spaceId}
          responseKind="curation"
          presentation="debate-vertical"
        />
        <CircleAction label={String(commentCount)} onClick={onComment} icon={<Comment />} ariaLabel="Comments" />
        <CircleAction label={String(claimsCount)} onClick={onClaims} icon={<InfoSmall />} ariaLabel="Claims" />
        <CircleAction label="Share" onClick={onShare} icon={<Share />} ariaLabel="Share debate" expanded={shareOpen} />
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
      <PillAction onClick={onComment} icon={<Comment />} label={String(commentCount)} ariaLabel="Comments" />
      <PillAction onClick={onClaims} icon={<InfoSmall />} label={String(claimsCount)} ariaLabel="Claims" />
      <PillAction
        onClick={onShare}
        icon={<Share />}
        label="Share"
        ariaLabel="Share debate"
        expanded={shareOpen}
        className="ml-auto"
      />
    </div>
  );
}

function CircleAction({
  label,
  icon,
  onClick,
  ariaLabel,
  expanded,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  // When set, the button opens a dialog — announce that and its open/closed state to screen readers,
  // which Radix would do via <Trigger> if the trigger lived in the sheet's own subtree.
  expanded?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup={expanded === undefined ? undefined : 'dialog'}
        aria-expanded={expanded}
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
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  // See {@link CircleAction}: announces the dialog and its open state when this button opens one.
  expanded?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-expanded={expanded}
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

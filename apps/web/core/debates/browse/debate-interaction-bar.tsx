'use client';

import * as React from 'react';

import cx from 'classnames';

import { InfoSmall } from '~/design-system/icons/info-small';
import { VoteArrow } from '~/design-system/icons/vote-arrow';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import type { SocialVideoHandoffMethod } from '../social-video-share';
import { Comment, Share } from './icons';

export type DebateVote = 'up' | 'down' | null;

export type DebateShareAction = {
  state: 'preparing' | 'ready' | 'sharing' | 'error';
  method: SocialVideoHandoffMethod | null;
  tooltipMessage?: string;
  onActivate: () => void;
};

type InteractionBarProps = {
  orientation: 'vertical' | 'horizontal';
  score: number;
  vote: DebateVote;
  onVote: (vote: DebateVote) => void;
  commentCount: number;
  claimsCount: number;
  onComment: () => void;
  onClaims: () => void;
  shareAction: DebateShareAction;
  className?: string;
};

/**
 * The upvote/downvote/comment/claims/share bar beside each debate. Renders the
 * controls and counts; voting is local-only and comments are a stub so far.
 */
export function DebateInteractionBar({
  orientation,
  score,
  vote,
  onVote,
  commentCount,
  claimsCount,
  onComment,
  onClaims,
  shareAction,
  className,
}: InteractionBarProps) {
  const shareUnavailable = shareAction.state === 'preparing' || shareAction.state === 'sharing';
  const shareAriaLabel = getShareAriaLabel(shareAction);
  const activateShare = () => {
    if (!shareUnavailable) shareAction.onActivate();
  };

  if (orientation === 'vertical') {
    return (
      <div className={cx('flex w-9 flex-col items-center gap-3', className)}>
        <VotePill orientation="vertical" score={score} vote={vote} onVote={onVote} />
        <CircleAction label={String(commentCount)} onClick={onComment} icon={<Comment />} ariaLabel="Comments" />
        <CircleAction label={String(claimsCount)} onClick={onClaims} icon={<InfoSmall />} ariaLabel="Claims" />
        <CircleAction
          label="Share"
          onClick={activateShare}
          icon={<Share />}
          ariaLabel={shareAriaLabel}
          ariaDisabled={shareUnavailable}
          tooltipMessage={shareAction.tooltipMessage}
        />
      </div>
    );
  }

  return (
    <div className={cx('flex w-full items-center gap-2', className)}>
      <VotePill orientation="horizontal" score={score} vote={vote} onVote={onVote} />
      <PillAction onClick={onComment} icon={<Comment />} label={String(commentCount)} ariaLabel="Comments" />
      <PillAction onClick={onClaims} icon={<InfoSmall />} label={String(claimsCount)} ariaLabel="Claims" />
      <PillAction
        onClick={activateShare}
        icon={<Share />}
        label="Share"
        ariaLabel={shareAriaLabel}
        ariaDisabled={shareUnavailable}
        tooltipMessage={shareAction.tooltipMessage}
        className="ml-auto"
      />
    </div>
  );
}

function VotePill({
  orientation,
  score,
  vote,
  onVote,
}: {
  orientation: 'vertical' | 'horizontal';
  score: number;
  vote: DebateVote;
  onVote: (vote: DebateVote) => void;
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-center gap-1.5 rounded-full border border-grey-02 bg-white text-text shadow-light',
        orientation === 'vertical' ? 'w-9 flex-col py-2' : 'h-7 px-2.5'
      )}
    >
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={vote === 'up'}
        onClick={() => onVote(vote === 'up' ? null : 'up')}
        className="group/vote flex items-center justify-center text-grey-04 transition-colors hover:text-text aria-pressed:text-ctaPrimary"
      >
        <VoteArrow direction="up" filled={vote === 'up'} color={vote === 'up' ? 'ctaPrimary' : undefined} />
      </button>
      <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
        {score}
      </Text>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={vote === 'down'}
        onClick={() => onVote(vote === 'down' ? null : 'down')}
        className="group/vote flex items-center justify-center text-grey-04 transition-colors hover:text-text aria-pressed:text-red-01"
      >
        <VoteArrow direction="down" filled={vote === 'down'} color={vote === 'down' ? 'red-01' : undefined} />
      </button>
    </div>
  );
}

function CircleAction({
  label,
  icon,
  onClick,
  ariaLabel,
  ariaDisabled,
  tooltipMessage,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  ariaDisabled?: boolean;
  tooltipMessage?: string;
}) {
  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border border-grey-02 bg-white text-grey-04 shadow-light transition-colors hover:text-text aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-1">
      {tooltipMessage ? <Tooltip trigger={button} label={tooltipMessage} position="left" /> : button}
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
  ariaDisabled,
  tooltipMessage,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  ariaDisabled?: boolean;
  tooltipMessage?: string;
  className?: string;
}) {
  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled}
      onClick={onClick}
      className={cx(
        'flex h-7 items-center gap-1.5 rounded-full border border-grey-02 bg-white px-2.5 text-grey-04 shadow-light transition-colors hover:text-text aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
        className
      )}
    >
      <span className="text-text">{icon}</span>
      <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
        {label}
      </Text>
    </button>
  );

  return tooltipMessage ? <Tooltip trigger={button} label={tooltipMessage} position="top" /> : button;
}

function getShareAriaLabel(shareAction: DebateShareAction) {
  if (shareAction.state === 'preparing') return 'Share debate video (preparing)';
  if (shareAction.state === 'sharing') return 'Sharing debate video';
  if (shareAction.state === 'error') {
    return shareAction.method ? 'Try sharing debate video again' : 'Retry debate video preparation';
  }
  return shareAction.method === 'download' ? 'Download debate video' : 'Share debate video';
}

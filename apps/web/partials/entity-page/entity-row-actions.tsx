'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimDebateButton } from '~/core/debates/claim-debate-button';

import { EntityVoteButtons } from './entity-vote-buttons';

type Props = {
  entityId: string;
  spaceId: string;
  children?: React.ReactNode;
  className?: string;
  /** Data blocks hide the vote controls when the Score property is hidden; Debate stays regardless. */
  showVotes?: boolean;
};

/** Entity-row actions in the claim design order: response, supporting actions, Debate. */
export function EntityRowActions({ entityId, spaceId, children, className, showVotes = true }: Props) {
  return (
    <div className={cx('flex items-center gap-4', className)}>
      {showVotes ? (
        <EntityVoteButtons entityId={entityId} spaceId={spaceId} claimResponderAvatarsPosition="trailing" />
      ) : null}
      {children}
      <ClaimDebateButton entityId={entityId} spaceId={spaceId} />
    </div>
  );
}

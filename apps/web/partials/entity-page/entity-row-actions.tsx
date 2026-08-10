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
};

/** Claim-row actions in the design order: response, supporting actions, Debate. */
export function EntityRowActions({ entityId, spaceId, children, className }: Props) {
  return (
    <div className={cx('flex items-center gap-4', className)}>
      <EntityVoteButtons entityId={entityId} spaceId={spaceId} claimResponderAvatarsPosition="trailing" />
      {children}
      <ClaimDebateButton entityId={entityId} spaceId={spaceId} />
    </div>
  );
}

'use client';

import * as React from 'react';

import cx from 'classnames';

import { EntityVoteButtons } from './entity-vote-buttons';

type Props = {
  entityId: string;
  spaceId: string;
  children?: React.ReactNode;
  className?: string;
};

/** Entity-row actions in the claim design order: response, then supporting actions. */
export function EntityRowActions({ entityId, spaceId, children, className }: Props) {
  return (
    <div className={cx('flex items-center gap-4', className)}>
      <EntityVoteButtons entityId={entityId} spaceId={spaceId} claimResponderAvatarsPosition="trailing" />
      {children}
    </div>
  );
}

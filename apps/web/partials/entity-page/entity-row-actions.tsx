'use client';

import * as React from 'react';

import cx from 'classnames';

import { EntityVoteButtons } from './entity-vote-buttons';

type Props = {
  entityId: string;
  spaceId: string;
  children?: React.ReactNode;
  className?: string;
  /** The entity's response in place of the votes — a topic's Follow (GEO-3191). */
  response?: React.ReactNode;
};

/** Entity-row actions in the claim design order: response, then supporting actions. */
export function EntityRowActions({ entityId, spaceId, children, className, response }: Props) {
  return (
    <div className={cx('flex items-center gap-4', className)}>
      {response ?? <EntityVoteButtons entityId={entityId} spaceId={spaceId} claimResponderAvatarsPosition="trailing" />}
      {children}
    </div>
  );
}

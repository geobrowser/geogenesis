'use client';

import * as React from 'react';

import { useIsOptimisticallyVoted } from './optimistic-voted-atom';

interface Props {
  proposalId: string;
  baseOrder: number;
  canSink: boolean;
  children: React.ReactNode;
}

const OPTIMISTIC_VOTE_ORDER_BUMP = 5000;

export function ProposalListItem({ proposalId, baseOrder, canSink, children }: Props) {
  const isOptimistic = useIsOptimisticallyVoted(proposalId);
  const order = isOptimistic && canSink ? baseOrder + OPTIMISTIC_VOTE_ORDER_BUMP : baseOrder;
  // Per-item border-bottom (rather than a parent `divide-y`) so dividers track
  // the visual position assigned by CSS `order`. With `divide-y`, the borderless
  // first DOM item would stay borderless even after being sunk to the visual
  // bottom, producing missing/spurious dividers when an item is voted on.
  return (
    <div style={{ order }} className="border-b border-grey-01">
      {children}
    </div>
  );
}

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
  return <div style={{ order }}>{children}</div>;
}

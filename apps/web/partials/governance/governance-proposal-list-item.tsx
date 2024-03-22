'use client';

import Link from 'next/link';

import { useActiveProposal } from '~/core/state/active-proposal-store';

interface Props {
  proposalId: string;
  spaceId: string;
  children: React.ReactNode;
}

export function GovernanceProposalsListItem({ children, spaceId, proposalId }: Props) {
  return (
    <Link href={`/space/${spaceId}/governance?proposalId=${proposalId}`} className="w-full py-6">
      {children}
    </Link>
  );
}

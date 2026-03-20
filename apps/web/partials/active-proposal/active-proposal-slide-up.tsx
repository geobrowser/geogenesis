'use client';

import * as React from 'react';

import { SlideUp } from '~/design-system/slide-up';

import { useCloseProposal } from './use-close-proposal';

type ActiveProposalSlideUpProps = {
  proposalId?: string;
  spaceId: string;
  children: React.ReactNode;
};

export function ActiveProposalSlideUp({ proposalId, spaceId, children }: ActiveProposalSlideUpProps) {
  const closeProposal = useCloseProposal(spaceId);

  return (
    <SlideUp
      isOpen={Boolean(proposalId)}
      setIsOpen={open => {
        if (!open) {
          closeProposal();
        }
      }}
    >
      <div className="h-full overflow-y-auto overscroll-contain">{children}</div>
    </SlideUp>
  );
}

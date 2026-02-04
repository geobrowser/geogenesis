'use client';

import * as React from 'react';

import { useExecuteProposal } from '~/core/hooks/use-execute-proposal';

import { Button } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  spaceId: string;
  children: React.ReactNode;
}

export function Execute({ onchainProposalId, spaceId, children }: Props) {
  const { execute } = useExecuteProposal({
    spaceId,
    onchainProposalId,
  });

  return (
    <Button variant="secondary" onClick={() => execute()}>
      {children}
    </Button>
  );
}

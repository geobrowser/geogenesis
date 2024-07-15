'use client';

import * as React from 'react';

import { useExecute } from '~/core/hooks/use-execute';

import { Button } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  contractAddress: `0x${string}`;
  children: React.ReactNode;
}

export function Execute({ onchainProposalId, contractAddress, children }: Props) {
  const execute = useExecute({
    address: contractAddress,
    onchainProposalId,
  });

  return (
    <Button variant="secondary" onClick={execute}>
      {children}
    </Button>
  );
}

'use client';

import * as React from 'react';

import { Button } from '~/design-system/button';

import { useReopenRejectedProposalEdits } from './use-reopen-rejected-proposal-edits';

type Props = {
  proposalId: string;
  spaceId: string;
};

export function GovernanceReopenEditButton({ proposalId, spaceId }: Props) {
  const { reopenEdit, busy } = useReopenRejectedProposalEdits(proposalId, spaceId);

  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={() => void reopenEdit()}
      className="shrink-0"
    >
      Reopen edit
    </Button>
  );
}

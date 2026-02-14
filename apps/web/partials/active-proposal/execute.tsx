'use client';

import * as React from 'react';

import { useExecuteProposal } from '~/core/hooks/use-execute-proposal';

import { Button, SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';
import { Tooltip } from '~/design-system/tooltip';

interface Props {
  proposalId: string;
  spaceId: string;
  children: React.ReactNode;
}

export function Execute({ proposalId, spaceId, children }: Props) {
  const { execute, status, error, reset } = useExecuteProposal({
    spaceId,
    proposalId,
  });

  const isPending = status === 'pending';

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <Tooltip
          trigger={<p className="text-smallButton text-red-01">Execute failed</p>}
          label={error?.message ?? 'An unknown error occurred'}
          position="bottom"
        />
        <SmallButton
          variant="secondary"
          onClick={() => {
            reset();
            execute();
          }}
        >
          Retry
        </SmallButton>
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={() => execute()} disabled={isPending}>
      <Pending isPending={isPending}>{children}</Pending>
    </Button>
  );
}

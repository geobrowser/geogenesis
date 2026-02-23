'use client';

import * as React from 'react';

import { useExecuteProposal } from '~/core/hooks/use-execute-proposal';

import { Button, SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';
import { Tooltip } from '~/design-system/tooltip';

interface Props {
  proposalId: string;
  spaceId: string;
  variant?: 'default' | 'small';
}

export function Execute({ proposalId, spaceId, variant = 'default' }: Props) {
  const { execute, status, error, reset } = useExecuteProposal({
    spaceId,
    proposalId,
  });

  const isPending = status === 'pending';
  const isSuccess = status === 'success';

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

  if (isSuccess) {
    return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">Executed</div>;
  }

  const ButtonComponent = variant === 'small' ? SmallButton : Button;

  return (
    <ButtonComponent variant="secondary" onClick={() => execute()} disabled={isPending}>
      <Pending isPending={isPending}>Execute</Pending>
    </ButtonComponent>
  );
}

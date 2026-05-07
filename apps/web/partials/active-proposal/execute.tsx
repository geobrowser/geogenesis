'use client';

import * as React from 'react';

import { useExecuteProposal } from '~/core/hooks/use-execute-proposal';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';

import { Button, SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

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
  const reportError = useReportError();

  const isPending = status === 'pending';
  const isSuccess = status === 'success';

  // Surface execution failures via the global error modal (with copy + retry).
  // After dismiss the user lands back on the regular Execute button.
  React.useEffect(() => {
    if (status !== 'error') return;
    const message = error ? describeError(error) : 'An unknown error occurred';
    reportError(`Execute failed: ${message}`, () => {
      reset();
      execute();
    });
  }, [status, error, reportError, reset, execute]);

  if (isSuccess) {
    return (
      <div className="inline-flex h-6 items-center rounded bg-successTertiary px-1.5 text-metadata leading-none text-green">
        Executed
      </div>
    );
  }

  const ButtonComponent = variant === 'small' ? SmallButton : Button;

  return (
    <ButtonComponent
      variant="secondary"
      onClick={() => {
        reset();
        execute();
      }}
      disabled={isPending}
    >
      <Pending isPending={isPending}>Execute</Pending>
    </ButtonComponent>
  );
}

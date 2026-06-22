'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useCanExecuteProposal, useExecuteProposal } from '~/core/hooks/use-execute-proposal';
import { useReportError } from '~/core/state/status-bar-store';
import { describeGovernanceError } from '~/core/utils/contracts/governance-errors';
import { isUserRejection } from '~/core/utils/error-diagnostics';

import { Button, SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

interface Props {
  proposalId: string;
  spaceId: string;
  variant?: 'default' | 'small';
  /** Rendered instead of nothing while the simulation is checking or when the user can't execute. */
  fallback?: React.ReactNode;
}

export function Execute({ proposalId, spaceId, variant = 'default', fallback = null }: Props) {
  const { execute, status, error, reset } = useExecuteProposal({
    spaceId,
    proposalId,
  });
  const canExecute = useCanExecuteProposal({ spaceId, proposalId });
  const reportError = useReportError();
  const router = useRouter();

  const isPending = status === 'pending';
  const isSuccess = status === 'success';

  // An on-chain simulation confirmed this proposal would revert (already
  // executed / stale) — refresh once so the list re-runs its filters and drops
  // the dead card; the ref guards against a refresh loop while the indexer is
  // still catching up.
  const hasRefreshedStale = React.useRef(false);
  React.useEffect(() => {
    if (canExecute !== false || hasRefreshedStale.current) return;
    hasRefreshedStale.current = true;
    router.refresh();
  }, [canExecute, router]);

  React.useEffect(() => {
    if (status !== 'error') return;

    // A wallet cancel isn't a failure to investigate — reset quietly instead of
    // firing the "Something went wrong" report, which would also bury real
    // execute reverts in the dev team's error reports. Matches the publish flow.
    if (isUserRejection(error)) {
      reset();
      return;
    }

    // Surface the actual on-chain revert (decoded to its named selector + hint,
    // with copy + retry) so the user — and any copied bug report — sees *why* it
    // failed. We used to guess that a revert meant "already applied" and silently
    // toast + refresh, but that guess is wrong for the common case (a passed
    // editor proposal the chain still won't execute, e.g. CanNotExecute): it hid
    // the real reason and looped on a refresh that never changed anything.
    const message = error ? describeGovernanceError(error) : 'An unknown error occurred';
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

  // Show the fallback (default: nothing) until the simulation confirms execution
  // would succeed (`undefined` = still checking, `false` = would revert) — unless
  // the user is already mid-execute, in which case the error effect handles it.
  if (canExecute !== true && status === 'idle') {
    return <>{fallback}</>;
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

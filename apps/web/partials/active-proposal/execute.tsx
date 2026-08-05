'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useExecuteProposal, useProposalExecutability } from '~/core/hooks/use-execute-proposal';
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
  const { state: executability } = useProposalExecutability({ spaceId, proposalId });
  const reportError = useReportError();
  const router = useRouter();

  const isPending = status === 'pending';
  const isSuccess = status === 'success';

  // A `blocked` simulation means the indexer is stale (already executed, or
  // votes/timing changed) — refresh once so the list re-runs its filters and
  // drops the card. `dead` is permanent (the card stays and shows the honest
  // status below), so don't refresh-loop on it. The ref guards against a loop
  // while the indexer catches up.
  const hasRefreshedStale = React.useRef(false);
  React.useEffect(() => {
    if (executability !== 'blocked' || hasRefreshedStale.current) return;
    hasRefreshedStale.current = true;
    router.refresh();
  }, [executability, router]);

  React.useEffect(() => {
    if (status !== 'error') return;

    // A wallet cancel isn't a failure to investigate — reset quietly instead of
    // firing the "Something went wrong" report, which would also bury real
    // execute reverts in the dev team's error reports. Matches the publish flow.
    if (isUserRejection(error)) {
      reset();
      return;
    }

    // Surface the decoded on-chain revert (named selector + hint, with copy +
    // retry) so the user — and any copied report — sees why it failed. Don't
    // assume a revert means "already applied"; for execute it usually doesn't
    // (CanNotExecute = not enough votes, or the voting period hasn't elapsed).
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

  // The proposal's own action reverts on-chain — it can never be executed and
  // "Pending execution" would be a lie. Say so honestly. (Editors can recreate
  // the request one click away from the Editors menu.)
  if (executability === 'dead' && status === 'idle') {
    return (
      <div
        className="inline-flex h-6 items-center rounded bg-errorTertiary px-1.5 text-metadata leading-none text-red-01"
        title="One of this proposal's on-chain actions reverts when executed. Older editor and member requests can hit this permanently and need to be recreated."
      >
        Can&apos;t be completed
      </div>
    );
  }

  // Show the fallback (default: nothing) until the simulation confirms execution
  // would succeed (`checking`/`blocked` keep the fallback) — unless the user is
  // already mid-execute, in which case the error effect handles it.
  if (executability !== 'executable' && status === 'idle') {
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

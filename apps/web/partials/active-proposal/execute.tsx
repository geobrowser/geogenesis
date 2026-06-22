'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useCanExecuteProposal, useExecuteProposal } from '~/core/hooks/use-execute-proposal';
import { useToast } from '~/core/hooks/use-toast';
import { getStaleProposalExecuteToastMessage } from '~/core/hooks/use-vote';
import { ProposalType } from '~/core/io/substream-schema';
import { useReportError } from '~/core/state/status-bar-store';
import { describeGovernanceError } from '~/core/utils/contracts/governance-errors';

import { Button, SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

interface Props {
  proposalId: string;
  spaceId: string;
  proposalType?: ProposalType;
  variant?: 'default' | 'small';
  /** Rendered instead of nothing while the simulation is checking or when the user can't execute. */
  fallback?: React.ReactNode;
}

export function Execute({ proposalId, spaceId, proposalType, variant = 'default', fallback = null }: Props) {
  const { execute, status, error, reset } = useExecuteProposal({
    spaceId,
    proposalId,
  });
  const canExecute = useCanExecuteProposal({ spaceId, proposalId });
  const reportError = useReportError();
  const router = useRouter();
  const [, setToast] = useToast();

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

    // A stale membership/editor request reverts because the change was already
    // applied via a duplicate request. Retrying would only revert again, so
    // toast + refresh (which re-runs the granted-request filter and drops the
    // proposal) instead of raising the looping retry error modal.
    const staleMessage = getStaleProposalExecuteToastMessage(error, proposalType);
    if (staleMessage) {
      reset();
      setToast(<span>{staleMessage}</span>);
      router.refresh();
      return;
    }

    // Surface other execution failures via the global error modal (with copy +
    // retry) — decoded to the named on-chain revert so a copied report tells us
    // the exact cause. After dismiss the user lands back on the Execute button.
    const message = error ? describeGovernanceError(error) : 'An unknown error occurred';
    reportError(`Execute failed: ${message}`, () => {
      reset();
      execute();
    });
  }, [status, error, proposalType, reportError, reset, execute, router, setToast]);

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

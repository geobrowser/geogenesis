'use client';

import * as React from 'react';

import { useAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { pendingCreatedSpaceAtom } from '~/core/state/pending-created-space';
import { useReportError } from '~/core/state/status-bar-store';
import { devLog } from '~/core/utils/dev-log';
import { describeError } from '~/core/utils/error-diagnostics';
import { NavUtils } from '~/core/utils/utils';

/**
 * Runs the background create-space deploy chain for an optimistically-dispatched
 * "+ New space" flow. Mounted globally (see entry.tsx) so it survives the modal
 * closing and client navigation. Keyed off `pendingCreatedSpaceAtom`: the dialog
 * snapshots the deploy args and closes; this runner does the slow work
 * (IPFS publish + on-chain factory tx + receipt + ~120s index wait) off the
 * critical path, then routes the user into the space once it's indexed.
 *
 * Mirrors `PendingPersonalSpaceRunner`, with two differences: the pending state
 * is in-memory only (DAO deploy is not idempotent — see pending-created-space.ts),
 * and on resolve there are no local `pending:` edits to remap, so it just
 * navigates to the freshly-indexed space.
 */
export function PendingCreatedSpaceRunner() {
  const [pending, setPending] = useAtom(pendingCreatedSpaceAtom);
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { deploy } = useDeploySpace();
  const router = useRouter();
  const reportError = useReportError();

  // Dedupe: never run two deploys for the same job at once (the effect re-fires
  // on every `pending`/atom change, and StrictMode double-mounts in dev).
  const runningRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!address) return;
    if (!pending) return;

    // Wallet switched without a logout cleanup: a record stamped with a
    // different account would deploy against the wrong address. Drop it.
    if (pending.address !== address) {
      setPending(null);
      return;
    }

    if (pending.status !== 'pending') return;

    if (runningRef.current === pending.jobId) return;
    runningRef.current = pending.jobId;

    // Deliberately NO `cancelled` flag / cleanup guard. This component is mounted
    // globally and the deploy is un-abortable, so a cleanup (StrictMode's dev
    // double-mount, or any dep change mid-flight) does not mean the work stopped
    // — it only means this effect run was superseded. Bailing on that signal
    // stranded the job: the space was minted on-chain, but the atom was never
    // cleared and runningRef was never released, so nothing navigated, no retry
    // could re-enter, and the stuck 'pending' job blocked every future create.
    // runningRef alone is the dedupe; the finally below always releases it.
    void (async () => {
      try {
        devLog('[create-space] background deploy started, jobId=%s', pending.jobId);
        const spaceId = await deploy({
          type: pending.type,
          spaceName: pending.spaceName,
          spaceImage: pending.spaceImage,
          governanceType: pending.governanceType,
          topicId: pending.topicId,
          votingSettings: pending.votingSettings,
        });

        if (!spaceId) throw new Error('Creating space failed');

        // `useDeploySpace.onSuccess` already invalidates ['spaces'] etc.; the
        // space is indexed by the time deploy() resolves, so navigation lands
        // on a populated page rather than notFound().
        setPending(null);
        devLog('[create-space] space created: %s — navigating', spaceId);
        router.push(NavUtils.toSpace(spaceId));
      } catch (error) {
        console.error('[PendingCreatedSpace] deploy failed', error);
        setPending({ ...pending, status: 'failed' });
        reportError(`Space creation failed: ${describeError(error)}`, () => {
          // Revive only if this job is still the one on deck. The status-bar
          // retry outlives the job, so without this check a click after a newer
          // create was queued would restore THIS job's stale snapshot over it.
          setPending(current => (current?.jobId === pending.jobId ? { ...current, status: 'pending' } : current));
        });
      } finally {
        // Always release, so a failed job's retry can re-enter the effect.
        runningRef.current = null;
      }
    })();
  }, [address, pending, deploy, router, reportError, setPending]);

  return null;
}

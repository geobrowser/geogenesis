'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { useToast } from '~/core/hooks/use-toast';
import type { EntityDiff } from '~/core/utils/diff/types';
import { useDiff } from '~/core/state/diff-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { applyEntityDiffsToLocalStore } from '~/core/utils/reopen-rejected-proposal/apply-entity-diffs-to-local-store';

import { governanceReopenEditLoadingAtom } from './governance-reopen-edit-loading-bar';

export function useReopenRejectedProposalEdits(proposalId: string, spaceId: string) {
  const { store } = useSyncEngine();
  const setGovernanceReopenLoading = useSetAtom(governanceReopenEditLoadingAtom);
  const { bumpReviewVersion, setIsReviewOpen, setActiveSpace } = useDiff();
  const [, setToast] = useToast();
  const [busy, setBusy] = React.useState(false);

  const reopenEdit = React.useCallback(async () => {
    setBusy(true);
    setGovernanceReopenLoading(true);
    try {
      const res = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}/diff?spaceId=${encodeURIComponent(spaceId)}`
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[governance] proposal diff API failed', res.status, errText);
        setToast(<span>Could not load proposal edits. Try again.</span>);
        return;
      }
      const data = (await res.json()) as { diffs?: EntityDiff[] };
      const diffs = data.diffs ?? [];
      if (diffs.length === 0) {
        setToast(<span>No edits were found for this proposal</span>);
        return;
      }
      await applyEntityDiffsToLocalStore(diffs, spaceId, store);
      setActiveSpace(spaceId);
      bumpReviewVersion();
      setIsReviewOpen(true);
    } catch (e) {
      console.error('[governance] reopen rejected proposal failed', e);
      setToast(<span>Could not load proposal edits. Try again.</span>);
    } finally {
      setGovernanceReopenLoading(false);
      setBusy(false);
    }
  }, [
    proposalId,
    spaceId,
    store,
    bumpReviewVersion,
    setIsReviewOpen,
    setGovernanceReopenLoading,
    setActiveSpace,
    setToast,
  ]);

  return { reopenEdit, busy };
}

'use client';

import * as React from 'react';

import { useToast } from '~/core/hooks/use-toast';
import type { EntityDiff } from '~/core/utils/diff/types';
import { useDiff } from '~/core/state/diff-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { applyEntityDiffsToLocalStore } from '~/core/utils/reopen-rejected-proposal/apply-entity-diffs-to-local-store';

export function useReopenRejectedProposalEdits(proposalId: string, spaceId: string) {
  const { store } = useSyncEngine();
  const { bumpReviewVersion, setIsReviewOpen, setIsReviewEditsLoading, setActiveSpace } = useDiff();
  const [, setToast] = useToast();
  const [busy, setBusy] = React.useState(false);

  const reopenEdit = React.useCallback(async () => {
    setBusy(true);
    setIsReviewEditsLoading(true);
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
      setIsReviewEditsLoading(false);
      setBusy(false);
    }
  }, [
    proposalId,
    spaceId,
    store,
    bumpReviewVersion,
    setIsReviewOpen,
    setIsReviewEditsLoading,
    setActiveSpace,
    setToast,
  ]);

  return { reopenEdit, busy };
}

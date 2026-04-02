'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useToast } from '~/core/hooks/use-toast';
import type { EntityDiff } from '~/core/utils/diff/types';
import { useDiff } from '~/core/state/diff-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { applyEntityDiffsToLocalStore } from '~/core/utils/reopen-rejected-proposal/apply-entity-diffs-to-local-store';

import { SquareButton } from '~/design-system/button';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { MenuItem } from '~/design-system/menu';

type Props = {
  proposalId: string;
  spaceId: string;
};

export function GovernanceRejectedProposalMenu({ proposalId, spaceId }: Props) {
  const { store } = useSyncEngine();
  const { bumpReviewVersion, setIsReviewOpen, setActiveSpace } = useDiff();
  const [, setToast] = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const onReopenEdit = React.useCallback(async () => {
    setOpen(false);
    setBusy(true);
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
      setBusy(false);
    }
  }, [proposalId, spaceId, store, bumpReviewVersion, setIsReviewOpen, setActiveSpace, setToast]);

  return (
    <div
      className="absolute top-0 right-0 z-10"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Dropdown.Root open={open} onOpenChange={setOpen}>
        <Dropdown.Trigger asChild>
          <SquareButton
            icon={<Ellipsis />}
            disabled={busy}
            className="border-none bg-transparent shadow-none hover:bg-bg"
            aria-label="Proposal actions"
          />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={4}
            className="z-1001 min-w-[180px] overflow-hidden rounded-lg border border-grey-02 bg-white py-1 shadow-lg"
          >
            <MenuItem onClick={onReopenEdit}>
              <p>Reopen edit</p>
            </MenuItem>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}

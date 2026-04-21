'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import { Button } from '~/design-system/button';
import { Gem } from '~/design-system/icons/gem';
import { Pending } from '~/design-system/pending';
import { Skeleton } from '~/design-system/skeleton';

import { BountyCard } from '~/partials/review/bounty-linking/bounty-card';
import {
  BountyLinkingPanel,
  useLinkableBounties,
  useLinkedBountiesForProposal,
  usePublishBountyLinks,
} from '~/partials/review/bounty-linking';

type LauncherProps = {
  proposalId: string;
  proposalName: string;
  spaceId: string;
  isAuthor: boolean;
  /** The personal page entity id for the connected user (optional — only needed to filter the
   *  linkable list to bounties allocated to this user). */
  personalPageEntityId?: string | null;
};

/**
 * Author-only "Link to bounty" control for the proposal voting screen. Renders a header button
 * (hidden for non-authors) and a fixed right-side drawer that reuses `BountyLinkingPanel` for
 * selection + `usePublishBountyLinks` for persistence. Initial selection is seeded from the
 * current set of linked bounties so the author can add new links; removing existing links is
 * not supported yet.
 */
export function ProposalBountyLinksLauncher({
  proposalId,
  proposalName,
  spaceId,
  isAuthor,
  personalPageEntityId = null,
}: LauncherProps) {
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();

  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedBountyIds, setSelectedBountyIds] = React.useState<Set<string>>(new Set());
  const [initialSelectionLoaded, setInitialSelectionLoaded] = React.useState(false);

  const { linkedBounties } = useLinkedBountiesForProposal({
    proposalId,
    enabled: isAuthor,
  });

  // Seed selection from the currently-linked bounties the first time they arrive. After that
  // the user owns the selection; we don't overwrite their in-progress edits if the query
  // refetches.
  React.useEffect(() => {
    if (!isAuthor || initialSelectionLoaded) return;
    if (linkedBounties.length === 0) return;
    setSelectedBountyIds(new Set(linkedBounties.map(b => b.id)));
    setInitialSelectionLoaded(true);
  }, [isAuthor, initialSelectionLoaded, linkedBounties]);

  const { bounties, bountiesById } = useLinkableBounties({
    activeSpace: spaceId,
    personalSpaceId: personalSpaceId ?? null,
    personalPageEntityId,
    enabled: isAuthor && isOpen,
  });

  // Ensure already-linked bounties show up in the picker even if they don't come back from
  // `useLinkableBounties` (e.g. status has moved to In Progress and the card would otherwise
  // be filtered out by allocation checks).
  const mergedBountiesById = React.useMemo(() => {
    const merged = new Map(bountiesById);
    for (const b of linkedBounties) {
      if (!merged.has(b.id)) merged.set(b.id, b);
    }
    return merged;
  }, [bountiesById, linkedBounties]);

  const mergedBounties = React.useMemo(() => Array.from(mergedBountiesById.values()), [mergedBountiesById]);

  const { publish, isPublishing } = usePublishBountyLinks({ personalSpaceId: personalSpaceId ?? null });

  const alreadyLinkedIds = React.useMemo(() => new Set(linkedBounties.map(b => b.id)), [linkedBounties]);
  const newlySelectedIds = React.useMemo(() => {
    const next = new Set<string>();
    for (const id of selectedBountyIds) if (!alreadyLinkedIds.has(id)) next.add(id);
    return next;
  }, [selectedBountyIds, alreadyLinkedIds]);

  const canSave = newlySelectedIds.size > 0 && Boolean(personalSpaceId);

  const handleSave = async () => {
    if (!canSave) return;
    await publish({
      proposalId,
      proposalName,
      toSpaceId: personalSpaceId && spaceId !== personalSpaceId ? spaceId : undefined,
      bountyIds: newlySelectedIds,
      bountiesById: mergedBountiesById,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['proposal-entity-for-bounty-links', proposalId] });
        queryClient.invalidateQueries({ queryKey: ['linked-bounty-entities'] });
        setIsOpen(false);
      },
    });
  };

  if (!isAuthor) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cx(
          'group inline-flex items-center gap-1.5 rounded border px-2 py-2 text-button font-normal transition-colors',
          'border-grey-02 bg-white text-text hover:border-text'
        )}
      >
        <Gem color="purple" />
        {selectedBountyIds.size > 0 ? <span>{selectedBountyIds.size}</span> : <span>Link to bounty</span>}
      </button>

      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-[10001] flex w-[416px] max-w-full flex-col bg-white shadow-xl">
          <div className="flex-1 min-h-0 overflow-hidden">
            <BountyLinkingPanel
              isOpen={isOpen}
              setIsOpen={setIsOpen}
              selectedBountyIds={selectedBountyIds}
              setSelectedBountyIds={setSelectedBountyIds}
              bounties={mergedBounties}
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-grey-02 bg-white p-3">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!canSave || isPublishing}>
              <Pending isPending={isPublishing}>Save links</Pending>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

type ListProps = {
  proposalId: string;
};

/**
 * Read-only display of the bounties already linked to this proposal. Visible to all viewers
 * (not just the author). Returns null when there are none, so it occupies no space for
 * proposals without any links.
 */
export function ProposalLinkedBountiesList({ proposalId }: ListProps) {
  const { linkedBounties, isLoading } = useLinkedBountiesForProposal({ proposalId });

  if (isLoading && linkedBounties.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-[2ch] pb-6">
        <Skeleton className="h-5 w-32" />
        <div className="mt-3 flex flex-col divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white px-4">
          <Skeleton className="my-4 h-24 w-full" />
        </div>
      </div>
    );
  }

  if (linkedBounties.length === 0) return null;

  return (
    <div className="mx-auto max-w-[1200px] px-[2ch] pb-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-purple">
          <Gem color="purple" />
        </span>
        <span className="text-body text-text">
          {linkedBounties.length} {linkedBounties.length === 1 ? 'linked bounty' : 'linked bounties'}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white px-4">
        {linkedBounties.map(bounty => (
          <BountyCard key={bounty.id} bounty={bounty} isSelected={false} onToggle={() => {}} readOnly />
        ))}
      </div>
    </div>
  );
}

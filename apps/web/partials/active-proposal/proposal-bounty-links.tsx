'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Gem } from '~/design-system/icons/gem';
import { Pending } from '~/design-system/pending';

import { BountyCard } from '~/partials/review/bounty-linking/bounty-card';
import {
  useLinkableBounties,
  useLinkedBountiesForProposal,
  usePublishBountyLinks,
} from '~/partials/review/bounty-linking';

type ProviderProps = {
  proposalId: string;
  proposalName: string;
  /** The DAO space this proposal targets. */
  spaceId: string;
  /** Wallet address of the proposal author; compared (case-insensitively) against the
   *  connected wallet to decide whether edit affordances are shown. */
  authorAddress: string;
  children: React.ReactNode;
};

type ContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  isAuthor: boolean;
  linkedCount: number;
};

const BountyLinksContext = React.createContext<ContextValue | null>(null);

function useBountyLinksContext(): ContextValue {
  const ctx = React.useContext(BountyLinksContext);
  if (!ctx) {
    throw new Error('ProposalBountyLinks components must be rendered inside <ProposalBountyLinksProvider>');
  }
  return ctx;
}

/**
 * Wraps the proposal voting view with shared bounty-linking state so that the header button
 * and the side panel can coordinate open/close without a parent-child relationship. Author
 * detection is done client-side via the connected wallet (not the server-side cookie) so
 * editing affordances appear as soon as the wallet hydrates, not when the cookie was set.
 */
export function ProposalBountyLinksProvider({
  proposalId,
  proposalName,
  spaceId,
  authorAddress,
  children,
}: ProviderProps) {
  const { smartAccount } = useSmartAccount();
  const connectedAddress = smartAccount?.account.address ?? null;
  const isAuthor = Boolean(
    connectedAddress && authorAddress && connectedAddress.toLowerCase() === authorAddress.toLowerCase()
  );

  const { linkedBounties } = useLinkedBountiesForProposal({ proposalId });
  const [isOpen, setIsOpen] = React.useState(false);

  const value = React.useMemo<ContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen(v => !v),
      isAuthor,
      linkedCount: linkedBounties.length,
    }),
    [isOpen, isAuthor, linkedBounties.length]
  );

  return (
    <BountyLinksContext.Provider value={value}>
      {children}
      <ProposalBountyLinksPanelInternal
        proposalId={proposalId}
        proposalName={proposalName}
        spaceId={spaceId}
        isAuthor={isAuthor}
      />
    </BountyLinksContext.Provider>
  );
}

/**
 * Header affordance. Shown to everyone when at least one bounty is linked (so viewers can
 * pop open the side panel and see them); shown to the author unconditionally so they can add
 * the first link.
 */
export function ProposalBountyLinksButton() {
  const { isAuthor, linkedCount, toggle } = useBountyLinksContext();

  if (!isAuthor && linkedCount === 0) return null;

  const label = linkedCount > 0 ? String(linkedCount) : 'Link to bounty';

  return (
    <button
      onClick={toggle}
      className={cx(
        'group inline-flex items-center gap-1.5 rounded border px-2 py-2 text-button font-normal transition-colors',
        'border-grey-02 bg-white text-text hover:border-text'
      )}
    >
      <Gem color="purple" />
      <span>{label}</span>
    </button>
  );
}

type PanelProps = {
  proposalId: string;
  proposalName: string;
  spaceId: string;
  isAuthor: boolean;
};

function ProposalBountyLinksPanelInternal({ proposalId, proposalName, spaceId, isAuthor }: PanelProps) {
  const { isOpen, close } = useBountyLinksContext();
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();

  const { linkedBounties, relationsByBountyId } = useLinkedBountiesForProposal({
    proposalId,
    enabled: isOpen,
  });

  // Seed selection from the currently-linked set whenever the panel opens. While open, the
  // selection is owned by the user so upstream refetches don't stomp in-progress edits.
  const [selectedBountyIds, setSelectedBountyIds] = React.useState<Set<string>>(new Set());
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setSelectedBountyIds(new Set(linkedBounties.map(b => b.id)));
    }
  }, [isOpen, linkedBounties]);

  // For authors, also offer bounties that aren't yet linked so they can add more in the same
  // panel. For viewers the picker is collapsed to just the currently-linked set.
  const { bounties: linkableBounties, bountiesById: linkableBountiesById } = useLinkableBounties({
    activeSpace: spaceId,
    personalSpaceId: personalSpaceId ?? null,
    personalPageEntityId: null,
    enabled: isOpen && isAuthor,
  });

  const mergedBountiesById = React.useMemo(() => {
    const merged = new Map(linkableBountiesById);
    for (const b of linkedBounties) {
      if (!merged.has(b.id)) merged.set(b.id, b);
    }
    return merged;
  }, [linkableBountiesById, linkedBounties]);

  const displayBounties = React.useMemo(() => {
    if (!isAuthor) return linkedBounties;
    // Show linked bounties first, then any other eligible bounties, so the author can see
    // what's already attached and optionally extend or trim.
    const seen = new Set<string>();
    const ordered: typeof linkedBounties = [];
    for (const b of linkedBounties) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        ordered.push(b);
      }
    }
    for (const b of linkableBounties) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        ordered.push(b);
      }
    }
    return ordered;
  }, [isAuthor, linkedBounties, linkableBounties]);

  const alreadyLinkedIds = React.useMemo(() => new Set(linkedBounties.map(b => b.id)), [linkedBounties]);

  const bountyIdsToAdd = React.useMemo(() => {
    if (!isAuthor) return new Set<string>();
    const next = new Set<string>();
    for (const id of selectedBountyIds) if (!alreadyLinkedIds.has(id)) next.add(id);
    return next;
  }, [isAuthor, selectedBountyIds, alreadyLinkedIds]);

  const relationsToRemove = React.useMemo(() => {
    if (!isAuthor) return [];
    const out = [];
    for (const bountyId of alreadyLinkedIds) {
      if (selectedBountyIds.has(bountyId)) continue;
      const relation = relationsByBountyId.get(bountyId);
      if (relation) out.push(relation);
    }
    return out;
  }, [isAuthor, alreadyLinkedIds, selectedBountyIds, relationsByBountyId]);

  const hasPendingChanges = bountyIdsToAdd.size > 0 || relationsToRemove.length > 0;
  const canSave = hasPendingChanges && Boolean(personalSpaceId);

  const { publish, isPublishing } = usePublishBountyLinks({ personalSpaceId: personalSpaceId ?? null });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['proposal-entity-for-bounty-links', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['linked-bounty-entities'] });
  };

  const handleSave = async () => {
    if (!canSave) return;
    await publish({
      proposalId,
      proposalName,
      toSpaceId: personalSpaceId && spaceId !== personalSpaceId ? spaceId : undefined,
      bountyIds: bountyIdsToAdd,
      bountiesById: mergedBountiesById,
      relationsToRemove,
      onSuccess: () => {
        invalidate();
        close();
      },
    });
  };

  const toggleBounty = (bountyId: string) => {
    setSelectedBountyIds(prev => {
      const next = new Set(prev);
      if (next.has(bountyId)) next.delete(bountyId);
      else next.add(bountyId);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[10001] flex w-[416px] max-w-full flex-col bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-grey-02 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-purple">
            <Gem color="purple" />
          </span>
          <span className="text-body text-text">
            {linkedBounties.length} linked {linkedBounties.length === 1 ? 'bounty' : 'bounties'}
          </span>
        </div>
        <SquareButton onClick={close} icon={<Close />} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {displayBounties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-body text-grey-04">
              {isAuthor
                ? 'No allocated bounties available to link in this space.'
                : 'No bounties are linked to this proposal.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-grey-02">
            {displayBounties.map(bounty => (
              <BountyCard
                key={bounty.id}
                bounty={bounty}
                isSelected={selectedBountyIds.has(bounty.id)}
                onToggle={toggleBounty}
                readOnly={!isAuthor}
              />
            ))}
          </div>
        )}
      </div>

      {isAuthor && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-grey-02 bg-white p-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || isPublishing}>
            <Pending isPending={isPublishing}>Save links</Pending>
          </Button>
        </div>
      )}
    </div>
  );
}

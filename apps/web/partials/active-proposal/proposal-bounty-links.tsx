'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { Button } from '~/design-system/button';
import { Gem } from '~/design-system/icons/gem';
import { Pending } from '~/design-system/pending';

import {
  BountyLinkingPanel,
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
  const { smartAccount } = useSmartAccount();
  const { profile } = useGeoProfile(smartAccount?.account.address);
  const personalPageEntityId = profile?.id ?? null;

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

  // Same query shape as the review-your-edits screen: allocation must match the user's
  // personal page entity OR their personal space, otherwise bounties allocated to the page
  // entity (the common case) disappear after an unlink and can't be re-linked.
  const { bounties: linkableBounties, bountiesById: linkableBountiesById } = useLinkableBounties({
    activeSpace: spaceId,
    personalSpaceId: personalSpaceId ?? null,
    personalPageEntityId,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[10001] flex flex-col items-stretch">
      {/* Reuse the exact review-your-edits panel so the card chrome, header label, and
          selection UX stay in lockstep with the review screen. */}
      <BountyLinkingPanel
        isOpen={isOpen}
        setIsOpen={value => {
          if (!value) close();
        }}
        selectedBountyIds={selectedBountyIds}
        setSelectedBountyIds={isAuthor ? setSelectedBountyIds : () => {}}
        bounties={displayBounties}
        readOnly={!isAuthor}
      />
      {isAuthor && hasPendingChanges && (
        <div className="mr-2 -mt-2 mb-2 flex w-[400px] shrink-0 items-center justify-end gap-2 rounded-lg bg-white px-4 py-3">
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

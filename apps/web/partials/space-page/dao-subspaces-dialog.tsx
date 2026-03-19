'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useActiveSubspaces } from '~/core/hooks/use-active-subspaces';
import { usePendingSubspaceProposals } from '~/core/hooks/use-pending-subspace-proposals';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { useSubspace } from '~/core/hooks/use-subspace';
import type { PendingSubspaceProposal } from '~/core/io/subgraph/fetch-pending-subspace-proposals';
import { NavUtils } from '~/core/utils/utils';

import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import {
  ActiveSubspacesList,
  type PendingAction,
  type RelationType,
  RelationTypeToggle,
  SpaceSearchDropdown,
  type SpaceSearchResult,
  SubspacesDialogShell,
} from './subspaces-dialog-shared';

// ============================================================================
// DAO Subspaces Dialog — proposal-based governance flow
// ============================================================================

interface DaoSubspacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

export function DaoSubspacesDialog({ open, onOpenChange, spaceId }: DaoSubspacesDialogProps) {
  const { query, setQuery, spaces: results, isLoading: isSearchLoading } = useSpacesQuery(open);
  const queryClient = useQueryClient();
  const {
    data: activeSubspaces,
    isLoading: isSubspacesLoading,
    isError: isSubspacesError,
    error: subspacesError,
  } = useActiveSubspaces(spaceId, open);
  const { data: pendingProposals, isLoading: isPendingLoading } = usePendingSubspaceProposals(spaceId, open);
  const { setSubspace, unsetSubspace } = useSubspace({ spaceId });
  const [pendingKeys, setPendingKeys] = React.useState<Map<string, PendingAction>>(new Map());
  const [addRelationType, setAddRelationType] = React.useState<RelationType>('related');

  const existingSubspaceIds = React.useMemo(
    () =>
      new Set(
        activeSubspaces.filter(subspace => subspace.relationType === addRelationType).map(subspace => subspace.id)
      ),
    [activeSubspaces, addRelationType]
  );

  const filteredResults = React.useMemo(
    () => results.filter(result => result.id !== spaceId && !existingSubspaceIds.has(result.id)),
    [results, existingSubspaceIds, spaceId]
  );

  const proposeAddSubspace = (space: SpaceSearchResult) => {
    const relationType = addRelationType;
    const key = `${space.id}:${relationType}`;

    // For DAO, setSubspace creates a proposal — don't optimistically add to active list.
    // Just show "Proposing..." feedback and invalidate pending proposals on success.
    setPendingKeys(prev => new Map(prev).set(key, 'adding'));
    setQuery('');

    setSubspace(
      { subspaceId: space.id, relationType },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['pending-subspace-proposals', spaceId] });
        },
        onSettled: () => {
          setPendingKeys(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        },
      }
    );
  };

  const proposeRemoveSubspace = (subspaceId: string, relationType: RelationType) => {
    const key = `${subspaceId}:${relationType}`;
    setPendingKeys(prev => new Map(prev).set(key, 'removing'));

    unsetSubspace(
      { subspaceId, relationType },
      {
        onSuccess: async () => {
          // For DAO, removal is a proposal — don't remove from active list yet.
          // Just refetch pending proposals to show the removal proposal.
          queryClient.invalidateQueries({ queryKey: ['pending-subspace-proposals', spaceId] });
        },
        onSettled: () => {
          setPendingKeys(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        },
      }
    );
  };

  return (
    <SubspacesDialogShell open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Text variant="metadata" as="p">
            Propose space
          </Text>
          <RelationTypeToggle value={addRelationType} onChange={setAddRelationType} disabled={pendingKeys.size > 0} />
        </div>
        <SpaceSearchDropdown
          query={query}
          onQueryChange={setQuery}
          results={filteredResults}
          isSearchLoading={isSearchLoading}
          pendingKeys={pendingKeys}
          addRelationType={addRelationType}
          addButtonLabel="Propose"
          onAdd={proposeAddSubspace}
        />
      </div>

      <ActiveSubspacesList
        subspaces={activeSubspaces}
        isLoading={isSubspacesLoading}
        isError={isSubspacesError}
        error={subspacesError}
        pendingKeys={pendingKeys}
        variant="dao"
        onAction={proposeRemoveSubspace}
      />

      <PendingProposalsSection proposals={pendingProposals} isLoading={isPendingLoading} onOpenChange={onOpenChange} />
    </SubspacesDialogShell>
  );
}

// ============================================================================
// Pending Proposals Section
// ============================================================================

interface PendingProposalsSectionProps {
  proposals: PendingSubspaceProposal[];
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
}

function PendingProposalsSection({ proposals, isLoading, onOpenChange }: PendingProposalsSectionProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pb-4">
        <Text variant="metadata" as="p">
          Pending proposals
        </Text>
        <div className="flex h-12 items-center justify-center">
          <Dots />
        </div>
      </div>
    );
  }

  if (proposals.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pb-4">
      <Text variant="metadata" as="p">
        Pending proposals
      </Text>
      {proposals.map(proposal => (
        <PendingProposalRow key={proposal.proposalId} proposal={proposal} onOpenChange={onOpenChange} />
      ))}
    </div>
  );
}

// ============================================================================
// Pending Proposal Row
// ============================================================================

interface PendingProposalRowProps {
  proposal: PendingSubspaceProposal;
  onOpenChange: (open: boolean) => void;
}

function PendingProposalRow({ proposal, onOpenChange }: PendingProposalRowProps) {
  const directionLabel = proposal.direction === 'add' ? 'Add' : 'Remove';
  const relationLabel = proposal.relationType === 'verified' ? 'Verified' : 'Related';

  return (
    <div>
      <div className="h-px w-full bg-divider" />
      <Link
        href={NavUtils.toProposal(proposal.spaceId, proposal.proposalId)}
        onClick={() => onOpenChange(false)}
        className="flex flex-col gap-1 py-3 transition-opacity hover:opacity-80"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="size-[22px] shrink-0 overflow-clip rounded-sm">
              <NativeGeoImage
                value={proposal.childSpaceImage || PLACEHOLDER_SPACE_IMAGE}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] object-cover"
              />
            </div>
            <Text variant="button" as="p">
              {proposal.childSpaceName}
            </Text>
            <span className="rounded-sm bg-grey-01 px-1 py-0.5 text-tag text-grey-04">{relationLabel}</span>
            <span
              className={`rounded-sm px-1 py-0.5 text-tag ${
                proposal.direction === 'add' ? 'bg-green/10 text-green' : 'bg-red-01/10 text-red-01'
              }`}
            >
              {directionLabel}
            </span>
          </div>
        </div>
        {proposal.childSpaceDescription ? (
          <Truncate maxLines={2} shouldTruncate variant="footnote">
            <Text variant="footnote" color="grey-04">
              {proposal.childSpaceDescription}
            </Text>
          </Truncate>
        ) : null}
      </Link>
    </div>
  );
}

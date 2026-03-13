'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useActiveSubspaces } from '~/core/hooks/use-active-subspaces';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { useSubspace } from '~/core/hooks/use-subspace';
import type { ActiveSubspace } from '~/core/io/subgraph/fetch-active-subspaces';

import { Text } from '~/design-system/text';

import { DaoSubspacesDialog } from './dao-subspaces-dialog';
import {
  ActiveSubspacesList,
  type PendingAction,
  type RelationType,
  RelationTypeToggle,
  SpaceSearchDropdown,
  type SpaceSearchResult,
  SubspacesDialogShell,
  sortSubspaces,
} from './subspaces-dialog-shared';

// ============================================================================
// Entry point — routes to the correct dialog variant based on space type
// ============================================================================

interface SubspacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

export function SubspacesDialog({ open, onOpenChange, spaceId }: SubspacesDialogProps) {
  const { space, isLoading } = useSpace(spaceId);

  // Don't render until we know the space type
  if (!open || isLoading || !space) return null;

  if (space.type === 'DAO') {
    return <DaoSubspacesDialog open={open} onOpenChange={onOpenChange} spaceId={spaceId} />;
  }

  return <PersonalSubspacesDialog open={open} onOpenChange={onOpenChange} spaceId={spaceId} />;
}

// ============================================================================
// Personal Spaces Dialog — direct add/remove, no governance
// ============================================================================

interface PersonalSubspacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

function PersonalSubspacesDialog({ open, onOpenChange, spaceId }: PersonalSubspacesDialogProps) {
  const { query, setQuery, spaces: results, isLoading: isSearchLoading } = useSpacesQuery(open);
  const queryClient = useQueryClient();
  const activeSubspacesQueryKey = ['active-subspaces', spaceId];
  const {
    data: activeSubspaces,
    isLoading: isSubspacesLoading,
    isError: isSubspacesError,
    error: subspacesError,
  } = useActiveSubspaces(spaceId, open);
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

  const addSubspace = async (space: SpaceSearchResult) => {
    const relationType = addRelationType;
    const key = `${space.id}:${relationType}`;
    const optimisticEntry: ActiveSubspace = {
      id: space.id,
      name: space.name ?? 'Untitled',
      description: space.description,
      image: space.image,
      relationType,
    };

    // Cancel in-flight refetches so they don't overwrite our optimistic entry
    await queryClient.cancelQueries({ queryKey: activeSubspacesQueryKey });

    queryClient.setQueryData<ActiveSubspace[]>(activeSubspacesQueryKey, current => {
      const currentSubspaces = current ?? [];
      const alreadyExists = currentSubspaces.some(s => s.id === space.id && s.relationType === relationType);
      if (alreadyExists) return currentSubspaces;
      return sortSubspaces([...currentSubspaces, optimisticEntry]);
    });
    setPendingKeys(prev => new Map(prev).set(key, 'adding'));
    setQuery('');

    setSubspace(
      { subspaceId: space.id, relationType },
      {
        onSuccess: () => {
          setPendingKeys(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        },
        onError: () => {
          queryClient.setQueryData<ActiveSubspace[]>(activeSubspacesQueryKey, current => {
            if (!current) return current;
            return current.filter(s => !(s.id === space.id && s.relationType === relationType));
          });
          setPendingKeys(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        },
      }
    );
  };

  const removeSubspace = async (subspaceId: string, relationType: RelationType) => {
    const key = `${subspaceId}:${relationType}`;

    // Cancel in-flight refetches so they don't overwrite our optimistic removal
    await queryClient.cancelQueries({ queryKey: activeSubspacesQueryKey });

    setPendingKeys(prev => new Map(prev).set(key, 'removing'));

    unsetSubspace(
      { subspaceId, relationType },
      {
        onSuccess: async () => {
          queryClient.setQueryData<ActiveSubspace[]>(activeSubspacesQueryKey, current => {
            if (!current) return current;
            return current.filter(s => !(s.id === subspaceId && s.relationType === relationType));
          });
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
            Add subspace
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
          addButtonLabel="Add subspace"
          onAdd={addSubspace}
        />
      </div>

      <ActiveSubspacesList
        subspaces={activeSubspaces}
        isLoading={isSubspacesLoading}
        isError={isSubspacesError}
        error={subspacesError}
        pendingKeys={pendingKeys}
        variant="personal"
        onAction={removeSubspace}
      />
    </SubspacesDialogShell>
  );
}

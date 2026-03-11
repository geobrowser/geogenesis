'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';

import * as React from 'react';

import { useActiveSubspaces } from '~/core/hooks/use-active-subspaces';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesQuery } from '~/core/hooks/use-spaces-query';
import { useSubspace } from '~/core/hooks/use-subspace';
import type { ActiveSubspace } from '~/core/io/subgraph/fetch-active-subspaces';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

interface SubspacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

function sortSubspaces(subspaces: ActiveSubspace[]) {
  return [...subspaces].sort((a, b) => {
    if (a.name === b.name) {
      return a.relationType.localeCompare(b.relationType);
    }

    return a.name.localeCompare(b.name);
  });
}

export function SubspacesDialog({ open, onOpenChange, spaceId }: SubspacesDialogProps) {
  const { query, setQuery, spaces: results, isLoading: isSearchLoading } = useSpacesQuery(open);
  const queryClient = useQueryClient();
  const activeSubspacesQueryKey = React.useMemo(() => ['active-subspaces', spaceId], [spaceId]);
  const {
    data: activeSubspaces,
    isLoading: isSubspacesLoading,
    isError: isSubspacesError,
    error: subspacesError,
  } = useActiveSubspaces(spaceId, open);
  const { space } = useSpace(spaceId);
  const { setSubspace, unsetSubspace, unsetStatus } = useSubspace({ spaceId });
  const [removingKey, setRemovingKey] = React.useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = React.useState<Set<string>>(new Set());

  const [addRelationType, setAddRelationType] = React.useState<'related' | 'verified'>('related');

  const isDao = space?.type === 'DAO';
  const isRemoving = unsetStatus === 'pending';

  const existingSubspaceIds = React.useMemo(
    () =>
      new Set(
        activeSubspaces
          .filter(subspace => subspace.relationType === addRelationType)
          .map(subspace => subspace.id)
      ),
    [activeSubspaces, addRelationType]
  );

  const filteredResults = React.useMemo(
    () => results.filter(result => result.id !== spaceId && !existingSubspaceIds.has(result.id)),
    [results, existingSubspaceIds, spaceId]
  );

  const addSubspace = (subspace: { id: string; name: string | null; description: string | null; image: string }) => {
    const relationType = addRelationType;
    const key = `${subspace.id}:${relationType}`;
    const optimisticEntry: ActiveSubspace = {
      id: subspace.id,
      name: subspace.name ?? 'Untitled',
      description: subspace.description,
      image: subspace.image,
      relationType,
    };

    // Optimistically add to cache and mark as pending immediately
    queryClient.setQueryData<ActiveSubspace[]>(activeSubspacesQueryKey, current => {
      const currentSubspaces = current ?? [];
      const alreadyExists = currentSubspaces.some(s => s.id === subspace.id && s.relationType === relationType);

      if (alreadyExists) return currentSubspaces;

      return sortSubspaces([...currentSubspaces, optimisticEntry]);
    });
    setPendingKeys(prev => new Set(prev).add(key));
    setQuery('');

    setSubspace(
      {
        subspaceId: subspace.id,
        relationType,
      },
      {
        onSuccess: () => {
          // Transaction confirmed — remove pending state, entry stays in cache
          setPendingKeys(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        },
        onError: () => {
          // Transaction failed — roll back optimistic entry
          queryClient.setQueryData<ActiveSubspace[]>(activeSubspacesQueryKey, current => {
            if (!current) return current;
            return current.filter(s => !(s.id === subspace.id && s.relationType === relationType));
          });
          setPendingKeys(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        },
      }
    );
  };

  const removeSubspace = (subspaceId: string, relationType: 'verified' | 'related') => {
    const key = `${subspaceId}:${relationType}`;
    setRemovingKey(key);

    unsetSubspace(
      {
        subspaceId,
        relationType,
      },
      {
        onSuccess: async () => {
          queryClient.setQueryData<ActiveSubspace[]>(activeSubspacesQueryKey, current => {
            if (!current) return current;

            return current.filter(
              currentSubspace => !(currentSubspace.id === subspaceId && currentSubspace.relationType === relationType)
            );
          });
        },
        onSettled: () => {
          setRemovingKey(null);
        },
      }
    );
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-100 flex items-start justify-center focus:outline-hidden">
          <div className="mt-32 flex w-[460px] flex-col gap-4 overflow-hidden rounded-xl bg-white px-4 pt-4 shadow-lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <Title asChild>
                  <Text variant="smallTitle" as="h2">
                    Subspaces
                  </Text>
                </Title>
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Text variant="metadata" as="p">
                    Add subspace
                  </Text>
                  <div className="relative flex overflow-hidden rounded-sm border border-grey-02">
                    <button
                      type="button"
                      className={`relative z-10 px-2 py-0.5 text-tag transition-colors ${
                        addRelationType === 'related' ? 'text-white' : 'text-grey-04 hover:bg-grey-01'
                      }`}
                      onClick={() => setAddRelationType('related')}
                    >
                      {addRelationType === 'related' && (
                        <motion.span
                          layoutId="subspace-type-indicator"
                          className="absolute inset-0 bg-text"
                          transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                        />
                      )}
                      <span className="relative z-10">Related</span>
                    </button>
                    <button
                      type="button"
                      className={`relative z-10 px-2 py-0.5 text-tag transition-colors ${
                        addRelationType === 'verified' ? 'text-white' : 'text-grey-04 hover:bg-grey-01'
                      }`}
                      onClick={() => setAddRelationType('verified')}
                    >
                      {addRelationType === 'verified' && (
                        <motion.span
                          layoutId="subspace-type-indicator"
                          className="absolute inset-0 bg-text"
                          transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                        />
                      )}
                      <span className="relative z-10">Verified</span>
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    withSearchIcon
                    placeholder="Search spaces..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg">
                      <ResizableContainer duration={0.15}>
                        <div className="max-h-[240px] overflow-y-auto">
                          {isSearchLoading && (
                            <div className="flex h-12 items-center justify-center">
                              <Dots />
                            </div>
                          )}
                          {!isSearchLoading && query && filteredResults.length === 0 && (
                            <div className="px-3 py-2 text-button text-grey-04">No spaces found</div>
                          )}
                          {!isSearchLoading &&
                            filteredResults.map((result, i) => (
                              <motion.div
                                key={result.id}
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.02 * i }}
                              >
                                <div className="flex items-center justify-between px-3 py-2.5">
                                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                    <div className="mt-0.5 size-[22px] shrink-0 overflow-clip rounded-sm">
                                      <NativeGeoImage value={result.image} alt="" width={22} height={22} className="h-[22px] w-[22px] object-cover" />
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                      <span className="text-button text-text">{result.name ?? 'Untitled'}</span>
                                      {result.description && (
                                        <Truncate maxLines={2} shouldTruncate variant="footnote">
                                          <Text variant="footnote" color="grey-04">
                                            {result.description}
                                          </Text>
                                        </Truncate>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isRemoving}
                                    className="ml-2 h-6 shrink-0 rounded-md border border-grey-02 px-[7px] text-metadata text-text disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => addSubspace({ id: result.id, name: result.name, description: result.description, image: result.image })}
                                  >
                                    Add subspace
                                  </button>
                                </div>
                              </motion.div>
                            ))}
                        </div>
                      </ResizableContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pb-4">
              <Text variant="metadata" as="p">
                Current active subspaces
              </Text>

              {isSubspacesLoading && (
                <div className="flex h-12 items-center justify-center">
                  <Dots />
                </div>
              )}

              {!isSubspacesLoading && isSubspacesError && (
                <div className="px-3 py-2 text-button text-grey-04">
                  {subspacesError instanceof Error ? subspacesError.message : 'Unable to load active subspaces'}
                </div>
              )}

              {!isSubspacesLoading && !isSubspacesError && (!activeSubspaces || activeSubspaces.length === 0) && (
                <div className="px-3 py-2 text-button text-grey-04">No active subspaces declared yet</div>
              )}

              {!isSubspacesLoading &&
                !isSubspacesError &&
                activeSubspaces?.map(subspace => {
                  const key = `${subspace.id}:${subspace.relationType}`;
                  const isPending = pendingKeys.has(key);

                  return (
                    <div key={key}>
                      <div className="h-px w-full bg-divider" />
                      <div className={`flex flex-col gap-1 py-3 ${isPending ? 'opacity-60' : ''}`}>
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="size-[22px] shrink-0 overflow-clip rounded-sm">
                              <NativeGeoImage value={subspace.image} alt="" width={22} height={22} className="h-[22px] w-[22px] object-cover" />
                            </div>
                            <Text variant="button" as="p">
                              {subspace.name}
                            </Text>
                            <span className="rounded-sm bg-grey-01 px-1 py-0.5 text-tag text-grey-04">
                              {subspace.relationType === 'verified' ? 'Verified' : 'Related'}
                            </span>
                          </div>
                          {isPending ? (
                            <span className="h-6 shrink-0 px-[7px] text-metadata text-grey-04">
                              {isDao ? 'Proposing...' : 'Adding...'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="h-6 shrink-0 rounded-md border border-grey-02 px-[7px] text-metadata text-text disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isRemoving}
                              onClick={() => removeSubspace(subspace.id, subspace.relationType)}
                            >
                              {isRemoving && removingKey === key ? 'Removing...' : 'Remove'}
                            </button>
                          )}
                        </div>
                        {subspace.description && (
                          <Truncate maxLines={2} shouldTruncate variant="footnote">
                            <Text variant="footnote" color="grey-04">
                              {subspace.description}
                            </Text>
                          </Truncate>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

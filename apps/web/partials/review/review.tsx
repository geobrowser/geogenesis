'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import pluralize from 'pluralize';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useLocalChanges } from '~/core/hooks/use-local-changes';
import { usePublish } from '~/core/hooks/use-publish';
import { getSpaces } from '~/core/io/v2/queries';
import { useDiff } from '~/core/state/diff-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Publish } from '~/core/utils/publish';
import { getImagePath } from '~/core/utils/utils';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { Blank } from '~/design-system/icons/blank';
import { Close } from '~/design-system/icons/close';
import { Dash } from '~/design-system/icons/dash';
import { Tick } from '~/design-system/icons/tick';
import { Pending } from '~/design-system/pending';
import { SlideUp } from '~/design-system/slide-up';

import { ChangedEntity } from '../diff/changed-entity';

export const Review = () => {
  const { isReviewOpen, setIsReviewOpen } = useDiff();

  return (
    <SlideUp isOpen={isReviewOpen} setIsOpen={setIsReviewOpen}>
      <ReviewChanges />
    </SlideUp>
  );
};

type Proposals = Record<PropertyKey, Proposal>;

type Proposal = {
  name: string;
  description: string;
};

const ReviewChanges = () => {
  const { state } = useStatusBar();
  const { store } = useSyncEngine();
  const [activeSpace, setActiveSpace] = useState<string>('');
  const { setIsReviewOpen } = useDiff();
  const queryClient = useQueryClient();

  const allSpacesWithTripleChanges = useValues(
    React.useMemo(() => {
      return {
        selector: t => t.hasBeenPublished === false,
        includeDeleted: true,
      };
    }, [])
  ).map(t => t.spaceId);

  const allSpacesWithRelationChanges = useRelations(
    React.useMemo(() => {
      return {
        selector: r => r.hasBeenPublished === false,
        includeDeleted: true,
      };
    }, [])
  ).map(r => r.spaceId);

  const dedupedSpacesWithActions = React.useMemo(() => {
    return [...new Set([...allSpacesWithTripleChanges, ...allSpacesWithRelationChanges]).values()];
  }, [allSpacesWithTripleChanges, allSpacesWithRelationChanges]);

  React.useEffect(() => {
    if (activeSpace === '' && dedupedSpacesWithActions[0]) {
      setActiveSpace(dedupedSpacesWithActions[0]);
    }
  }, [dedupedSpacesWithActions, activeSpace]);

  const { data: spaces, isLoading: isSpacesLoading } = useQuery({
    queryKey: ['spaces-in-review', dedupedSpacesWithActions],
    queryFn: async () => {
      const maybeSpaces = await Effect.runPromise(getSpaces({ spaceIds: dedupedSpacesWithActions }));

      const spaces = maybeSpaces.filter(s => s.entity !== null);

      const spacesMap = new Map<string, { id: string; name: string | null; image: string | null }>();

      for (const space of spaces) {
        const id = space.id;
        const config = space.entity;
        const image = config ? getImagePath(config.image) : PLACEHOLDER_SPACE_IMAGE;

        spacesMap.set(id, {
          id,
          name: config.name,
          image,
        });
      }

      return spacesMap;
    },
  });

  // Set a new default active space when active spaces change
  useEffect(() => {
    if (
      dedupedSpacesWithActions.length === 0 &&
      state.reviewState !== 'publish-complete' &&
      state.reviewState !== 'publishing-contract'
    ) {
      setIsReviewOpen(false);
    } else if (dedupedSpacesWithActions.length === 1) {
      setActiveSpace(dedupedSpacesWithActions[0] ?? '');
    }
  }, [dedupedSpacesWithActions, setActiveSpace, setIsReviewOpen, state.reviewState]);

  // Options for space selector dropdown
  const options = dedupedSpacesWithActions.map(spaceId => ({
    value: spaceId,
    label: (
      <span className="inline-flex items-center gap-2 text-button text-text">
        <span className="relative h-4 w-4 overflow-hidden rounded-sm">
          <img
            src={spaces?.get(spaceId)?.image ?? undefined}
            className="absolute inset-0 h-full w-full object-cover object-center"
            alt=""
          />
        </span>
        <span>{spaces?.get(spaceId)?.name}</span>
      </span>
    ),
    disabled: activeSpace === spaceId,
    onClick: () => setActiveSpace(spaceId),
  }));

  // Proposal state
  const [proposals, setProposals] = useState<Proposals>({});
  const proposalName = proposals[activeSpace]?.name?.trim() ?? '';
  // Entity Id -> Attribute Id -> boolean
  const [unstagedChanges, setUnstagedChanges] = useState<Record<string, Record<string, boolean>>>({});

  const valuesFromSpace = useValues(
    React.useMemo(() => {
      return {
        selector: t => t.spaceId === activeSpace && t.isLocal === true,
        includeDeleted: true,
      };
    }, [activeSpace])
  );

  const relationsFromSpace = useRelations(
    React.useMemo(() => {
      return {
        selector: r => r.spaceId === activeSpace && r.isLocal === true,
        includeDeleted: true,
      };
    }, [activeSpace])
  );

  const isReadyToPublish =
    proposalName?.length > 0 &&
    Publish.prepareLocalDataForPublishing(valuesFromSpace, relationsFromSpace, activeSpace).length > 0;

  const [isPublishing, setIsPublishing] = useState(false);
  const { makeProposal } = usePublish();
  const [changes, isLoading] = useLocalChanges(activeSpace);

  const handleDeleteAttribute = useCallback((entityId: string, attributeId: string) => {
    // Delete all values for this attribute from this entity
    const valuesToDelete = valuesFromSpace.filter(
      v => v.entity.id === entityId && v.property.id === attributeId
    );

    const relationsToDelete = relationsFromSpace.filter(
      r => r.fromEntity.id === entityId && r.type.id === attributeId
    );

    // Remove from store and IndexedDB
    if (valuesToDelete.length > 0) {
      store.discardValues(valuesToDelete.map(v => v.id));
    }

    if (relationsToDelete.length > 0) {
      store.discardRelations(relationsToDelete.map(r => r.id));
    }

    // Invalidate the query to refetch and update UI
    queryClient.invalidateQueries({ queryKey: ['local-changes', activeSpace] });
  }, [valuesFromSpace, relationsFromSpace, store, queryClient, activeSpace]);

  const handleDeleteAllForEntity = useCallback((entityId: string) => {
    const valuesToDelete = valuesFromSpace.filter(v => v.entity.id === entityId);
    const relationsToDelete = relationsFromSpace.filter(r => r.fromEntity.id === entityId);

    if (valuesToDelete.length > 0) {
      store.discardValues(valuesToDelete.map(v => v.id));
    }

    if (relationsToDelete.length > 0) {
      store.discardRelations(relationsToDelete.map(r => r.id));
    }

    // Invalidate the query to refetch and update UI
    queryClient.invalidateQueries({ queryKey: ['local-changes', activeSpace] });
  }, [valuesFromSpace, relationsFromSpace, store, queryClient, activeSpace]);

  const handleStaging = (entityId: string, attributeId: string) => {
    const newChanges = { ...unstagedChanges };
    newChanges[entityId] = {};

    // if (!unstaged) {

    //   setUnstagedChanges({
    //     ...unstagedChanges,
    //     [entityId]: {
    //       ...(unstagedChanges[entityId] ?? {}),
    //       [attributeId]: true,
    //     },
    //   });
    // } else {
    //   const newUnstagedChanges: Record<string, Record<string, boolean>> = { ...unstagedChanges };
    //   if (newUnstagedChanges?.[entityId] && newUnstagedChanges?.[entityId]?.[attributeId]) {
    //     delete newUnstagedChanges?.[entityId]?.[attributeId];
    //   }
    //   setUnstagedChanges(newUnstagedChanges);
    // }
  };

  const handlePublish = useCallback(async () => {
    if (!activeSpace) return;
    setIsPublishing(true);

    const clearProposalName = () => {
      setProposals({ ...proposals, [activeSpace]: { name: '', description: '' } });
    };

    // @TODO: Selectable publishing

    await makeProposal({
      values: valuesFromSpace,
      relations: relationsFromSpace,
      spaceId: activeSpace,
      name: proposalName,
      onSuccess: () => {
        clearProposalName();
      },
    });

    setIsPublishing(false);
  }, [activeSpace, proposalName, proposals, makeProposal, valuesFromSpace, relationsFromSpace]);

  if (isLoading || !changes || isSpacesLoading) {
    return <div>Loading...</div>;
  }

  const totalChanges = changes.length;
  const totalEdits = changes.flatMap(c => c.changes).length;

  const unstaged = false;

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 py-1 md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsReviewOpen(false)} icon={<Close />} />
          {dedupedSpacesWithActions.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <span className="text-metadataMedium leading-none">Review your edits in</span>
              {dedupedSpacesWithActions.length === 1 && (
                <span className="inline-flex items-center gap-2 text-button text-text ">
                  <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <img
                      src={spaces?.get(activeSpace)?.image ?? undefined}
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      alt=""
                    />
                  </span>
                  <span>{spaces?.get(activeSpace)?.name}</span>
                </span>
              )}
              {dedupedSpacesWithActions.length > 1 && (
                <Dropdown
                  trigger={
                    <span className="inline-flex items-center gap-2">
                      <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                        <img
                          src={spaces?.get(activeSpace)?.image ?? undefined}
                          className="absolute inset-0 h-full w-full object-cover object-center"
                          alt=""
                        />
                      </span>
                      <span>{spaces?.get(activeSpace)?.name}</span>
                    </span>
                  }
                  align="start"
                  options={options}
                />
              )}
            </div>
          )}
        </div>
        <div>
          <Button onClick={handlePublish} disabled={!isReadyToPublish || isPublishing}>
            <Pending isPending={isPublishing}>Publish</Pending>
          </Button>
        </div>
      </div>
      <div className="h-full overflow-y-auto overflow-x-clip overscroll-contain bg-white">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          <div className="relative flex flex-col gap-16">
            <div className="absolute right-0 top-0 z-10 flex items-center gap-8">
              <div className="inline-flex items-center gap-2">
                <span>
                  <span className="font-medium">
                    {totalEdits} {pluralize('edit', totalEdits)}
                  </span>{' '}
                  selected to publish
                </span>
                <SquareButton
                  icon={totalEdits === 0 ? <Blank /> : totalEdits === totalChanges ? <Tick /> : <Dash />}
                  onClick={() => setUnstagedChanges({})}
                />
              </div>
              <div>
                <SmallButton
                  onClick={() => {
                    store.clearAllUnpublished();
                    // Invalidate the query to refetch and update UI
                    queryClient.invalidateQueries({ queryKey: ['local-changes', activeSpace] });
                  }}
                >
                  Delete all
                </SmallButton>
              </div>
            </div>
            <div className="relative flex flex-col ">
              <div className="text-body">Proposal name</div>
              <input
                type="text"
                value={proposals[activeSpace]?.name ?? ''}
                onChange={({ currentTarget }) =>
                  setProposals({
                    ...proposals,
                    [activeSpace]: { ...proposals[activeSpace], name: currentTarget.value },
                  })
                }
                placeholder="Name your proposal..."
                className="bg-transparent text-[40px] font-semibold text-text placeholder:text-grey-02 focus:outline-none"
              />
              <div className="absolute -bottom-10 -left-32 -right-32 h-px bg-divider" />
            </div>
            <div className="relative flex flex-col gap-16 divide-y divide-divider pt-16">
              {changes.map(change => (
                <ChangedEntity
                  key={change.id}
                  change={change}
                  deleteAllComponent={
                    <div className="absolute right-0 top-0">
                      <SmallButton onClick={() => handleDeleteAllForEntity(change.id)}>Delete all</SmallButton>
                    </div>
                  }
                  renderAttributeStagingComponent={attributeId => (
                    <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
                      <SquareButton
                        onClick={() => handleDeleteAttribute(change.id, attributeId)}
                        icon={<Close />}
                        className="opacity-0 group-hover:opacity-100"
                      />
                    </div>
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

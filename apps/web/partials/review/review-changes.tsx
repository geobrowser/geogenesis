'use client';

import { Effect } from 'effect';
import { useSetAtom } from 'jotai';

import * as React from 'react';

import { useAutofocus } from '~/core/hooks/use-autofocus';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { useLocalChanges } from '~/core/hooks/use-local-changes';
import { usePublish } from '~/core/hooks/use-publish';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { useDiff } from '~/core/state/diff-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Pending } from '~/design-system/pending';
import { Skeleton } from '~/design-system/skeleton';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

import { ChangedEntity, hasVisibleChanges } from '~/partials/diffs/changed-entity';

import { editorContentVersionAtom } from '~/atoms';

type Proposals = Record<string, { name: string; description: string }>;

export const ReviewChanges = () => {
  const { isReviewOpen, setIsReviewOpen, reviewVersion } = useDiff();
  const { state: statusBarState } = useStatusBar();
  const { makeProposal } = usePublish();
  const { store } = useSyncEngine();
  const bumpEditorContentVersion = useSetAtom(editorContentVersionAtom);

  const [proposals, setProposals] = React.useState<Proposals>({});
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [spaces, setSpaces] = React.useState<Space[]>([]);

  const valuesWithChanges = useValues({
    selector: t => t.hasBeenPublished === false && t.isLocal === true,
    includeDeleted: true,
  });

  const relationsWithChanges = useRelations({
    selector: r => r.hasBeenPublished === false && r.isLocal === true,
    includeDeleted: true,
  });

  const dedupedSpacesWithActions = React.useMemo(() => {
    const valueSpaceIds = valuesWithChanges.map(t => t.spaceId);
    const relationSpaceIds = relationsWithChanges.map(r => r.spaceId);

    return [...new Set([...valueSpaceIds, ...relationSpaceIds])];
  }, [valuesWithChanges, relationsWithChanges]);

  const spacesKey = dedupedSpacesWithActions.sort().join(',');
  const [activeSpace, setActiveSpace] = React.useState<string>('');

  React.useEffect(() => {
    if (activeSpace === '' && dedupedSpacesWithActions[0]) {
      setActiveSpace(dedupedSpacesWithActions[0]);
    }
  }, [spacesKey, activeSpace]);

  React.useEffect(() => {
    // Don't clear spaces metadata when dedupedSpacesWithActions becomes empty (e.g. after
    // publishing). The space name/image are still needed in the top bar during the
    // publish-complete state. Stale metadata is harmless and gets replaced on the next fetch.
    if (dedupedSpacesWithActions.length === 0) {
      return;
    }

    const fetchSpaces = async () => {
      const result = await Effect.runPromise(getSpaces({ spaceIds: dedupedSpacesWithActions }));
      setSpaces(result);
    };

    fetchSpaces();
  }, [spacesKey]);

  React.useEffect(() => {
    if (
      dedupedSpacesWithActions.length === 0 &&
      statusBarState.reviewState !== 'publish-complete' &&
      statusBarState.reviewState !== 'publishing-contract'
    ) {
      setIsReviewOpen(false);
    } else if (dedupedSpacesWithActions.length === 1) {
      setActiveSpace(dedupedSpacesWithActions[0] ?? '');
    }
  }, [spacesKey, statusBarState.reviewState, setIsReviewOpen]);

  const rawProposalName = proposals[activeSpace]?.name ?? '';
  const proposalName = rawProposalName.trim();

  const valuesFromSpace = useValues({
    selector: t => t.spaceId === activeSpace && t.isLocal === true,
    includeDeleted: true,
  });

  const relationsFromSpace = useRelations({
    selector: r => r.spaceId === activeSpace && r.isLocal === true,
    includeDeleted: true,
  });

  const isReadyToPublish = proposalName.length > 0;

  // Focus the proposal name input after the SlideUp animation completes (0.5s delay + 0.5s duration)
  const proposalNameRef = useAutofocus<HTMLInputElement>(isReviewOpen, 1000);

  const [entities, isLoadingChanges] = useLocalChanges(activeSpace, reviewVersion);
  const visibleEntities = React.useMemo(() => entities.filter(hasVisibleChanges), [entities]);
  const hasVisibleEntities = visibleEntities.length > 0;
  const activeSpaceMetadata = spaces.find(s => s.id === activeSpace);

  const handleProposalNameChange = (name: string) => {
    setProposals(prev => ({
      ...prev,
      [activeSpace]: { ...prev[activeSpace], name, description: prev[activeSpace]?.description ?? '' },
    }));
  };

  const handleSubmit = React.useCallback(async () => {
    if (!activeSpace || !isReadyToPublish) return;
    setIsPublishing(true);

    await makeProposal({
      values: valuesFromSpace,
      relations: relationsFromSpace,
      spaceId: activeSpace,
      name: proposalName,
      onSuccess: () => {
        setProposals(prev => ({ ...prev, [activeSpace]: { name: '', description: '' } }));
      },
      onError: () => {},
    });

    setIsPublishing(false);
  }, [activeSpace, isReadyToPublish, makeProposal, valuesFromSpace, relationsFromSpace, proposalName]);

  useKeyboardShortcuts(
    React.useMemo(
      () =>
        isReviewOpen && isReadyToPublish && !isPublishing ? [{ key: 'Enter', callback: () => handleSubmit() }] : [],
      [isReviewOpen, isReadyToPublish, isPublishing, handleSubmit]
    )
  );

  const handleDeleteAll = () => {
    if (!activeSpace) return;
    store.clearLocalChangesForSpace(activeSpace);
    // Force the TipTap editor to recreate with fresh server content.
    bumpEditorContentVersion(v => v + 1);
  };

  const spaceOptions = spaces.map(space => ({
    label: (
      <div className="flex items-center gap-2">
        {space.entity.image && (
          <div className="h-5 w-5 overflow-hidden rounded">
            <NativeGeoImage value={space.entity.image} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <span>{space.entity.name ?? space.id}</span>
      </div>
    ),
    value: space.id,
    disabled: false,
    onClick: () => setActiveSpace(space.id),
  }));

  return (
    <SlideUp isOpen={isReviewOpen} setIsOpen={setIsReviewOpen}>
      <div className="flex h-full w-full flex-col gap-2 bg-grey-01">
        <div className="flex shrink-0 items-center justify-between bg-white px-4 py-3">
          <div className="flex items-center gap-4">
            <SquareButton onClick={() => setIsReviewOpen(false)} icon={<Close />} />
            <span className="text-metadataMedium leading-none">Review your edits in</span>
            {dedupedSpacesWithActions.length > 1 ? (
              <Dropdown
                trigger={
                  <div className="flex items-center gap-2">
                    {activeSpaceMetadata?.entity.image && (
                      <div className="h-5 w-5 overflow-hidden rounded">
                        <NativeGeoImage
                          value={activeSpaceMetadata.entity.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <span>{activeSpaceMetadata?.entity.name ?? activeSpace}</span>
                  </div>
                }
                options={spaceOptions}
              />
            ) : (
              <div className="flex items-center gap-2">
                {activeSpaceMetadata?.entity.image && (
                  <div className="h-5 w-5 overflow-hidden rounded">
                    <NativeGeoImage
                      value={activeSpaceMetadata.entity.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <span className="text-metadataMedium leading-none font-semibold">
                  {activeSpaceMetadata?.entity.name ?? activeSpace}
                </span>
              </div>
            )}
          </div>
          <Button variant="primary" onClick={handleSubmit} disabled={!isReadyToPublish || isPublishing}>
            <Pending isPending={isPublishing}>
              {activeSpaceMetadata?.type === 'PERSONAL' ? 'Publish edits' : 'Propose edits'}
            </Pending>
          </Button>
        </div>
        <div className="px-2">
          <div className="rounded-xl bg-white px-4 py-10">
            <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
              <div className="text-body">Proposal name</div>
              <input
                ref={proposalNameRef}
                type="text"
                value={rawProposalName}
                onChange={e => handleProposalNameChange(e.target.value)}
                placeholder="Name your proposal..."
                className="w-full bg-transparent text-[40px] font-semibold text-text placeholder:text-grey-02 focus:outline-hidden"
              />
              <div className="absolute top-4 right-4 xl:right-[2ch]">
                <SmallButton onClick={handleDeleteAll}>Delete all</SmallButton>
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 grow flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-2">
          {statusBarState.reviewState === 'publish-complete' ? null : isLoadingChanges ? (
            <div className="rounded-xl bg-white p-4">
              <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
                <div className="mb-4 flex items-center gap-3">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-6 w-48" />
                </div>
                <div className="mb-4 grid grid-cols-2 gap-20">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-20">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-20">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : !hasVisibleEntities ? (
            <div className="rounded-xl bg-white p-4">
              <div className="relative mx-auto w-full max-w-[1350px] shrink-0 py-12 text-center">
                <Text as="p" variant="body" className="text-grey-04">
                  No changes to review. Make some edits to see them here.
                </Text>
              </div>
            </div>
          ) : (
            visibleEntities.map(entity => (
              <div key={entity.entityId} className="rounded-xl bg-white p-4">
                <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
                  <ChangedEntity entity={entity} spaceId={activeSpace} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </SlideUp>
  );
};

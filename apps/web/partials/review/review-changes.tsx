'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { useQuery } from '@tanstack/react-query';
import cx from 'classnames';
import { Effect } from 'effect';
import { useSetAtom } from 'jotai';

import * as React from 'react';

import { editorContentVersionAtom } from '~/atoms';
import {
  BOUNTIES_RELATION_TYPE,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID,
  BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
  BOUNTY_TYPE_ID,
} from '~/core/constants';
import { useAutofocus } from '~/core/hooks/use-autofocus';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { useLocalChanges } from '~/core/hooks/use-local-changes';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { ID } from '~/core/id';
import type { Space } from '~/core/io/dto/spaces';
import { getAllEntities, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import { useDiff } from '~/core/state/diff-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { Relation as StoreRelation, Value as StoreValue } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Gem } from '~/design-system/icons/gem';
import { Pending } from '~/design-system/pending';
import { Skeleton } from '~/design-system/skeleton';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

import { ChangedEntity, hasVisibleChanges } from '~/partials/diffs/changed-entity';

import { BountyLinkingPanel } from './bounty-linking';
import type { Bounty, BountyDifficulty, BountyStatus } from './bounty-linking/types';

type Proposals = Record<string, { name: string; description: string }>;

const BOUNTY_DESCRIPTION_NAMES = new Set(['description', 'details', 'summary']);
const BOUNTY_MAX_PAYOUT_NAMES = new Set(['max payout', 'maximum payout', 'payout', 'reward', 'reward amount']);
const BOUNTY_BUDGET_NAMES = new Set(['bounty budget', 'budget']);
const BOUNTY_MAX_CONTRIBUTORS_NAMES = new Set(['max contributors', 'maximum contributors', 'contributors']);
const BOUNTY_SUBMISSIONS_PER_PERSON_NAMES = new Set([
  'submissions per person',
  'submissions per contributor',
  'submissions per user',
]);
const BOUNTY_DIFFICULTY_NAMES = new Set(['difficulty', 'difficulty level', 'level']);
const BOUNTY_STATUS_NAMES = new Set(['status', 'state']);
const BOUNTY_DEADLINE_NAMES = new Set(['deadline', 'due date', 'due']);
const BOUNTY_SUBMISSIONS_NAMES = new Set(['submissions', 'your submissions']);

export const ReviewChanges = () => {
  const { isReviewOpen, setIsReviewOpen, reviewVersion } = useDiff();
  const { state: statusBarState } = useStatusBar();
  const { makeProposal } = usePublish();
  const { store } = useSyncEngine();
  const bumpEditorContentVersion = useSetAtom(editorContentVersionAtom);
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile } = useGeoProfile(address);
  const personalPageEntityId = profile?.id ?? null;

  const [proposals, setProposals] = React.useState<Proposals>({});
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [spaces, setSpaces] = React.useState<Space[]>([]);
  const [isBountyLinkingOpen, setIsBountyLinkingOpen] = React.useState(false);
  const [selectedBountyIds, setSelectedBountyIds] = React.useState<Set<string>>(new Set());

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

  const bountyTypeRelations = useRelations({
    selector: r =>
      r.spaceId === activeSpace &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.isDeleted !== true,
  });

  const bountyEntityIds = React.useMemo(() => {
    const ids = bountyTypeRelations
      .filter(isBountyTypeRelation)
      .map(relation => relation.fromEntity.id);
    return [...new Set(ids)];
  }, [bountyTypeRelations]);

  const bountyEntityIdSet = React.useMemo(() => new Set(bountyEntityIds), [bountyEntityIds]);

  const bountyValues = useValues({
    selector: value =>
      value.spaceId === activeSpace &&
      bountyEntityIdSet.has(value.entity.id) &&
      value.isDeleted !== true,
  });

  const bountyRelations = useRelations({
    selector: relation =>
      relation.spaceId === activeSpace &&
      bountyEntityIdSet.has(relation.fromEntity.id) &&
      relation.isDeleted !== true,
  });

  const { data: remoteBountyEntities = [] } = useQuery({
    queryKey: ['bounties-by-type', activeSpace, BOUNTY_TYPE_ID],
    enabled: Boolean(activeSpace && isReviewOpen),
    queryFn: async () => {
      if (!activeSpace) return [];
      return await Effect.runPromise(
        getAllEntities({
          spaceId: activeSpace,
          typeIds: { is: BOUNTY_TYPE_ID },
        })
      );
    },
  });

  const allBountyIds = React.useMemo(() => {
    const remoteIds = remoteBountyEntities.map(entity => entity.id);
    return [...new Set([...bountyEntityIds, ...remoteIds])];
  }, [bountyEntityIds, remoteBountyEntities]);

  const { data: bountySubmissionRelations = [] } = useQuery({
    queryKey: ['bounty-submission-relations', allBountyIds],
    enabled: allBountyIds.length > 0,
    queryFn: async () => {
      return await Effect.runPromise(getRelationsByToEntityIds(allBountyIds, BOUNTIES_RELATION_TYPE));
    },
  });

  const { data: bountyPersonalSubmissionRelations = [] } = useQuery({
    queryKey: ['bounty-submission-relations-personal', allBountyIds, personalSpaceId],
    enabled: allBountyIds.length > 0 && Boolean(personalSpaceId),
    queryFn: async () => {
      if (!personalSpaceId) return [];
      return await Effect.runPromise(
        getRelationsByToEntityIds(allBountyIds, BOUNTIES_RELATION_TYPE, personalSpaceId)
      );
    },
  });

  const bountySubmissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const relation of bountySubmissionRelations) {
      const id = relation.toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bountySubmissionRelations]);

  const bountyPersonalSubmissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const relation of bountyPersonalSubmissionRelations) {
      const id = relation.toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bountyPersonalSubmissionRelations]);

  const { bounties, bountiesById } = React.useMemo(() => {
    if (!personalSpaceId) {
      return { bounties: [], bountiesById: new Map<string, Bounty>() };
    }

    const allocationTargets = [personalSpaceId, personalPageEntityId].filter(
      (id): id is string => Boolean(id)
    );
    const localResult = buildBounties(
      bountyEntityIds,
      bountyValues,
      bountyRelations,
      bountySubmissionCounts,
      bountyPersonalSubmissionCounts,
      allocationTargets,
      activeSpace,
      personalSpaceId
    );
    const remoteBounties = remoteBountyEntities
      .filter(entity => isAllocatedToUser(entity.relations ?? [], allocationTargets))
      .map(entity =>
        buildBounty(
          entity.id,
          entity.values ?? [],
          entity.relations ?? [],
          bountySubmissionCounts,
          bountyPersonalSubmissionCounts,
          activeSpace,
          personalSpaceId
        )
      );

    console.info('[bounty-linking] Allocation pre-filter', {
      activeSpace,
      personalSpaceId,
      personalPageEntityId,
      allocationTargets,
      localBounties: bountyEntityIds.map(entityId => {
        const relations = (bountyRelations ?? []).filter(r => r.fromEntity.id === entityId);
        return {
          id: entityId,
          allocatedTo: relations
            .filter(r => r.type.id === BOUNTY_ALLOCATED_PROPERTY_ID)
            .map(r => r.toEntity?.id ?? (r as StoreRelation & { toEntityId?: string }).toEntityId ?? null)
            .filter((id): id is string => Boolean(id)),
        };
      }),
      remoteBounties: remoteBountyEntities.map(entity => ({
        id: entity.id,
        allocatedTo: (entity.relations ?? [])
          .filter(r => r.type?.id === BOUNTY_ALLOCATED_PROPERTY_ID)
          .map(r => r.toEntity?.id ?? (r as StoreRelation & { toEntityId?: string }).toEntityId ?? null)
          .filter((id): id is string => Boolean(id)),
      })),
    });

    const merged = new Map<string, Bounty>();
    for (const bounty of remoteBounties) merged.set(bounty.id, bounty);
    for (const bounty of localResult.bounties) merged.set(bounty.id, bounty);

    console.info('[bounty-linking] Linkable bounties', {
      activeSpace,
      personalSpaceId,
      personalPageEntityId,
      localCount: localResult.bounties.length,
      remoteCount: remoteBounties.length,
      totalCount: merged.size,
      localIds: localResult.bounties.map(bounty => bounty.id),
      remoteIds: remoteBounties.map(bounty => bounty.id),
    });

    return { bounties: Array.from(merged.values()), bountiesById: merged };
  }, [
    bountyEntityIds,
    bountyValues,
    bountyRelations,
    remoteBountyEntities,
    bountySubmissionCounts,
    bountyPersonalSubmissionCounts,
    activeSpace,
    personalSpaceId,
    personalPageEntityId,
  ]);

  const bountyIdSet = React.useMemo(() => new Set(bounties.map(bounty => bounty.id)), [bounties]);

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

    console.info('[bounty-linking] Submit start', {
      activeSpace,
      proposalName,
      selectedBountyIds: Array.from(selectedBountyIds),
      personalSpaceId,
    });

    let publishPromiseResolve: (value: boolean) => void = () => {};
    const publishPromise = new Promise<boolean>(resolve => {
      publishPromiseResolve = resolve;
    });

    const makePromise = makeProposal({
      values: valuesFromSpace,
      relations: relationsFromSpace,
      spaceId: activeSpace,
      name: proposalName,
      onSuccess: () => {
        setProposals(prev => ({ ...prev, [activeSpace]: { name: '', description: '' } }));
        console.info('[bounty-linking] Proposal publish success', { activeSpace });
        publishPromiseResolve(true);
      },
      onError: () => {
        console.info('[bounty-linking] Proposal publish error', { activeSpace });
        publishPromiseResolve(false);
      },
    });

    const publishSucceeded = await Promise.race([publishPromise, makePromise.then(() => false)]);

    console.info('[bounty-linking] Proposal publish finished', { publishSucceeded });

    if (publishSucceeded && selectedBountyIds.size > 0 && personalSpaceId) {
      const proposalEntityId = ID.createEntityId();
      const bountyLinkValues: StoreValue[] = [
        {
          id: ID.createValueId({
            entityId: proposalEntityId,
            propertyId: SystemIds.NAME_PROPERTY,
            spaceId: personalSpaceId,
          }),
          entity: {
            id: proposalEntityId,
            name: proposalName,
          },
          property: {
            id: SystemIds.NAME_PROPERTY,
            name: 'Name',
            dataType: 'TEXT',
          },
          spaceId: personalSpaceId,
          value: proposalName,
          isLocal: true,
          isDeleted: false,
          hasBeenPublished: false,
          timestamp: new Date().toISOString(),
        },
      ];

      const bountyTargetSpaceId = activeSpace !== personalSpaceId ? activeSpace : undefined;

      const bountyLinkRelations: StoreRelation[] = Array.from(selectedBountyIds).flatMap(bountyId => {
        const bounty = bountiesById.get(bountyId);
        if (!bounty) return [];
        return [
          {
            id: ID.createEntityId(),
            entityId: ID.createEntityId(),
            spaceId: personalSpaceId,
            toSpaceId: bountyTargetSpaceId,
            renderableType: 'RELATION',
            verified: false,
            position: Position.generate(),
            type: {
              id: BOUNTIES_RELATION_TYPE,
              name: 'Bounties',
            },
            fromEntity: {
              id: proposalEntityId,
              name: proposalName,
            },
            toEntity: {
              id: bounty.id,
              name: bounty.name,
              value: bounty.id,
            },
          },
        ];
      });

      if (bountyLinkRelations.length > 0) {
        console.info('[bounty-linking] Published relation ids', bountyLinkRelations.map(r => r.id), {
          proposalEntityId,
          personalSpaceId,
          bountyTargetSpaceId,
        });
      }

      await makeProposal({
        values: bountyLinkValues,
        relations: bountyLinkRelations,
        spaceId: personalSpaceId,
        name: `Bounty links for: ${proposalName}`,
        onSuccess: () => {
          setSelectedBountyIds(new Set());
          console.info('[bounty-linking] Link publish success', { personalSpaceId });
        },
        onError: () => {
          console.info('[bounty-linking] Link publish error', { personalSpaceId });
        },
      });
    }

    setIsPublishing(false);
  }, [
    activeSpace,
    isReadyToPublish,
    makeProposal,
    valuesFromSpace,
    relationsFromSpace,
    proposalName,
    selectedBountyIds,
    personalSpaceId,
    bountiesById,
  ]);

  useKeyboardShortcuts(
    React.useMemo(
      () =>
        isReviewOpen && isReadyToPublish && !isPublishing
          ? [{ key: 'Enter', callback: () => handleSubmit() }]
          : [],
      [isReviewOpen, isReadyToPublish, isPublishing, handleSubmit]
    )
  );

  const handleDeleteAll = () => {
    if (!activeSpace) return;
    store.clearLocalChangesForSpace(activeSpace);
    // Force the TipTap editor to recreate with fresh server content.
    bumpEditorContentVersion(v => v + 1);
  };

  React.useEffect(() => {
    setIsBountyLinkingOpen(false);
    setSelectedBountyIds(new Set());
  }, [activeSpace]);

  React.useEffect(() => {
    if (selectedBountyIds.size === 0) return;
    setSelectedBountyIds(prev => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (bountyIdSet.has(id)) {
          next.add(id);
        }
      }
      if (next.size === prev.size) {
        for (const id of next) {
          if (!prev.has(id)) return next;
        }
        return prev;
      }
      return next;
    });
  }, [bountyIdSet, selectedBountyIds.size]);

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBountyLinkingOpen(prev => !prev)}
              disabled={bounties.length === 0}
              className={cx(
                'group inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-button transition-colors',
                bounties.length === 0
                  ? 'cursor-not-allowed border-grey-02 bg-grey-01 text-grey-03'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <Gem color="purple" />
              {selectedBountyIds.size > 0 ? <span>{selectedBountyIds.size}</span> : <span>Link to bounty</span>}
            </button>
            <Button variant="primary" onClick={handleSubmit} disabled={!isReadyToPublish || isPublishing}>
              <Pending isPending={isPublishing}>
                {activeSpaceMetadata?.type === 'PERSONAL' ? 'Publish edits' : 'Propose edits'}
              </Pending>
            </Button>
          </div>
        </div>
        <div className="flex grow overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="px-2">
              <div className="rounded-xl bg-white px-4 py-10">
                <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-body">Proposal name</div>
                      <input
                        ref={proposalNameRef}
                        type="text"
                        value={rawProposalName}
                        onChange={e => handleProposalNameChange(e.target.value)}
                        placeholder="Name your proposal..."
                        className="w-full bg-transparent text-[40px] font-semibold text-text placeholder:text-grey-02 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <SmallButton onClick={handleDeleteAll}>Delete all</SmallButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex grow flex-col gap-2 overflow-y-scroll px-2 pb-2">
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
          <BountyLinkingPanel
            isOpen={isBountyLinkingOpen}
            setIsOpen={setIsBountyLinkingOpen}
            selectedBountyIds={selectedBountyIds}
            setSelectedBountyIds={setSelectedBountyIds}
            bounties={bounties}
          />
        </div>
      </div>
    </SlideUp>
  );
};

function isBountyTypeRelation(relation: StoreRelation): boolean {
  return relation.toEntity.id === BOUNTY_TYPE_ID;
}

function buildBounties(
  entityIds: string[],
  values: StoreValue[],
  relations: StoreRelation[],
  submissionCounts: Map<string, number>,
  personalSubmissionCounts: Map<string, number>,
  allocationTargets: string[],
  spaceId?: string,
  personalSpaceId?: string
): { bounties: Bounty[]; bountiesById: Map<string, Bounty> } {
  const valuesByEntity = new Map<string, StoreValue[]>();
  const relationsByEntity = new Map<string, StoreRelation[]>();

  for (const value of values) {
    const existing = valuesByEntity.get(value.entity.id) ?? [];
    existing.push(value);
    valuesByEntity.set(value.entity.id, existing);
  }

  for (const relation of relations) {
    const existing = relationsByEntity.get(relation.fromEntity.id) ?? [];
    existing.push(relation);
    relationsByEntity.set(relation.fromEntity.id, existing);
  }

  const bounties = entityIds
    .filter(entityId => isAllocatedToUser(relationsByEntity.get(entityId) ?? [], allocationTargets))
    .map(entityId => {
    const entityValues = valuesByEntity.get(entityId) ?? [];
    const entityRelations = relationsByEntity.get(entityId) ?? [];

    return buildBounty(
      entityId,
      entityValues,
      entityRelations,
      submissionCounts,
      personalSubmissionCounts,
      spaceId,
      personalSpaceId
    );
  });

  const bountiesById = new Map(bounties.map(bounty => [bounty.id, bounty]));

  return { bounties, bountiesById };
}

function buildBounty(
  entityId: string,
  entityValues: StoreValue[],
  entityRelations: StoreRelation[],
  submissionCounts: Map<string, number>,
  personalSubmissionCounts: Map<string, number>,
  spaceId?: string,
  personalSpaceId?: string
): Bounty {
  const name =
    Entities.name(entityValues) ??
    findValueByNames(entityValues, new Set(['name', 'title'])) ??
    entityValues[0]?.entity.name ??
    'Untitled bounty';

  const description =
    Entities.description(entityValues) ??
    findValueByNames(entityValues, BOUNTY_DESCRIPTION_NAMES) ??
    null;

  const maxPayout = parseNumber(
    findValueByNames(entityValues, BOUNTY_MAX_PAYOUT_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_MAX_PAYOUT_NAMES)
  );

  const budget = parseNumber(
    findValueById(entityValues, BOUNTY_BUDGET_PROPERTY_ID) ??
      findValueByNames(entityValues, BOUNTY_BUDGET_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_BUDGET_NAMES)
  );

  const maxContributors = parseNumber(
    findValueById(entityValues, BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID) ??
      findValueByNames(entityValues, BOUNTY_MAX_CONTRIBUTORS_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_MAX_CONTRIBUTORS_NAMES)
  );

  const submissionsPerPerson = parseNumber(
    findValueById(entityValues, BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID) ??
      findValueByNames(entityValues, BOUNTY_SUBMISSIONS_PER_PERSON_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_SUBMISSIONS_PER_PERSON_NAMES)
  );

  const submissionsCount = submissionCounts.get(entityId) ?? 0;
  const userSubmissionsCount = personalSubmissionCounts.get(entityId) ?? 0;

  const difficulty = parseDifficulty(
    findValueByNames(entityValues, BOUNTY_DIFFICULTY_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_DIFFICULTY_NAMES)
  );

  const status = parseStatus(
    findValueByNames(entityValues, BOUNTY_STATUS_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_STATUS_NAMES)
  );

  const deadline =
    findValueByNames(entityValues, BOUNTY_DEADLINE_NAMES) ??
    findRelationValueByNames(entityRelations, BOUNTY_DEADLINE_NAMES) ??
    null;

  const submissions = parseSubmissions(
    findValueByNames(entityValues, BOUNTY_SUBMISSIONS_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_SUBMISSIONS_NAMES)
  );

  return {
    id: entityId,
    spaceId,
    name,
    description,
    maxPayout,
    budget,
    maxContributors,
    submissionsPerPerson,
    submissionsCount,
    userSubmissionsCount,
    difficulty,
    status,
    deadline,
    yourSubmissions: submissions,
  };
}

function findValueByNames(values: StoreValue[], names: Set<string>): string | null {
  const match = values.find(value => {
    const normalized = normalizeName(value.property.name);
    return normalized ? names.has(normalized) : false;
  });
  return match?.value ?? null;
}

function findValueById(values: StoreValue[], propertyId: string): string | null {
  const match = values.find(value => value.property.id === propertyId);
  return match?.value ?? null;
}

function findRelationValueByNames(relations: StoreRelation[], names: Set<string>): string | null {
  const match = relations.find(relation => {
    const normalized = normalizeName(relation.type.name);
    return normalized ? names.has(normalized) : false;
  });
  return match?.toEntity.name ?? null;
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDifficulty(value: string | null): BountyDifficulty | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.startsWith('LOW')) return 'LOW';
  if (normalized.startsWith('MED')) return 'MEDIUM';
  if (normalized.startsWith('HARD')) return 'HARD';
  if (normalized.startsWith('EXP')) return 'EXPERT';
  return null;
}

function parseStatus(value: string | null): BountyStatus | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.includes('OPEN')) return 'OPEN';
  if (normalized.includes('ALLOCATED')) return 'ALLOCATED';
  if (normalized.includes('SELF')) return 'SELF_ASSIGNED';
  if (normalized.includes('PROGRESS')) return 'IN_PROGRESS';
  if (normalized.includes('COMPLETE')) return 'COMPLETED';
  if (normalized.includes('CANCEL')) return 'CANCELLED';
  return null;
}

function parseSubmissions(value: string | null): { current: number; max: number } | null {
  if (!value) return null;
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const current = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;
  return { current, max };
}

function isAllocatedToUser(relations: StoreRelation[], allocationTargets: string[]): boolean {
  if (allocationTargets.length === 0) return false;
  const targetIds = new Set(allocationTargets);
  return relations.some(relation => {
    if (relation.type.id !== BOUNTY_ALLOCATED_PROPERTY_ID) return false;
    const toEntityId =
      relation.toEntity?.id ??
      (relation as StoreRelation & { toEntityId?: string }).toEntityId ??
      null;
    return toEntityId ? targetIds.has(toEntityId) : false;
  });
}

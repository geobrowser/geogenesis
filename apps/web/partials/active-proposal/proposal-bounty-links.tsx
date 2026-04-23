'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import {
  BOUNTIES_RELATION_TYPE,
  BOUNTY_TYPE_ID,
  PLACEHOLDER_SPACE_IMAGE,
  PROPOSAL_TYPE_ID,
} from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { ID } from '~/core/id';
import { getAllEntities, getEntity, getRelationsByFromEntityId, getRelationsByToEntityIds, getSpace, getSpaces } from '~/core/io/queries';
import { fetchSpacesWithAncestors } from '~/core/io/subgraph/fetch-spaces-with-ancestors';
import type { Relation, Value } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Button, SquareButton } from '~/design-system/button';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Gem } from '~/design-system/icons/gem';
import { Pending } from '~/design-system/pending';

import {
  BountyCard,
  buildBounty,
  buildBountyAllocationTargets,
  hasBountyTaskStatusDoneRelation,
  isAllocatedToUser,
} from '~/partials/review/bounty-linking';
import type { Bounty } from '~/partials/review/bounty-linking/types';

type Props = {
  daoSpaceId: string;
  proposalId: string;
  proposalName: string;
  authorSpaceId: string;
};

function bountySpaceFallbackLabel(spaceId: string): string {
  const compact = spaceId.replace(/-/g, '');
  return compact.length > 14 ? `${compact.slice(0, 6)}…${compact.slice(-4)}` : spaceId;
}

function spaceIdsEqual(a: string, b: string): boolean {
  return a.replace(/^0x/i, '').toLowerCase() === b.replace(/^0x/i, '').toLowerCase();
}

export function ProposalBountyLinks({ daoSpaceId, proposalId, proposalName, authorSpaceId }: Props) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile } = useGeoProfile(address);
  const personalPageEntityId = profile?.id ?? null;
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();

  const isAuthor = Boolean(
    personalSpaceId && personalSpaceId.length > 0 && spaceIdsEqual(personalSpaceId, authorSpaceId)
  );

  const [isOpen, setIsOpen] = React.useState(false);
  const [draftIds, setDraftIds] = React.useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = React.useState(false);

  const { data: space } = useQuery({
    queryKey: ['space', daoSpaceId],
    queryFn: () => Effect.runPromise(getSpace(daoSpaceId)),
    staleTime: 60_000,
  });

  const showBounties = space?.type === 'DAO';

  const { data: linkedRelations = [], isLoading: isLoadingLinks } = useQuery({
    queryKey: ['proposal-bounty-relations', proposalId, authorSpaceId, BOUNTIES_RELATION_TYPE],
    enabled: showBounties,
    queryFn: () => Effect.runPromise(getRelationsByFromEntityId(proposalId, BOUNTIES_RELATION_TYPE, authorSpaceId)),
    staleTime: 30_000,
  });

  const relationByBountyId = React.useMemo(() => {
    const m = new Map<string, Relation>();
    for (const r of linkedRelations) {
      m.set(r.toEntity.id, r);
    }
    return m;
  }, [linkedRelations]);

  const linkedBountyIds = React.useMemo(
    () => [...relationByBountyId.keys()].sort(),
    [relationByBountyId]
  );

  const n = linkedBountyIds.length;

  const { data: bountySearchSpaceIds = [] } = useQuery({
    queryKey: ['bounty-link-spaces-ancestors', daoSpaceId],
    enabled: showBounties && isOpen && isAuthor,
    staleTime: 60_000,
    queryFn: () => fetchSpacesWithAncestors(daoSpaceId),
  });

  const { data: remoteBountyEntities = [] } = useQuery({
    queryKey: ['bounties-by-type', bountySearchSpaceIds.join(','), BOUNTY_TYPE_ID, 'gov-panel'],
    enabled: isAuthor && showBounties && bountySearchSpaceIds.length > 0 && isOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const pages = await Promise.all(
        bountySearchSpaceIds.map(spaceId =>
          Effect.runPromise(
            getAllEntities({
              spaceId,
              typeIds: { is: BOUNTY_TYPE_ID },
            })
          )
        )
      );
      const merged = new Map<string, (typeof pages)[0][0]>();
      for (const entities of pages) {
        for (const entity of entities) {
          merged.set(entity.id, entity);
        }
      }
      return [...merged.values()];
    },
  });

  const allSelectableIds = React.useMemo(
    () => [...new Set([...remoteBountyEntities.map(e => e.id), ...linkedBountyIds])].sort(),
    [remoteBountyEntities, linkedBountyIds]
  );

  const { data: bountySubmissionRelations = [] } = useQuery({
    queryKey: ['bounty-submission-relations', allSelectableIds],
    enabled: isAuthor && isOpen && allSelectableIds.length > 0,
    staleTime: 60_000,
    queryFn: () => Effect.runPromise(getRelationsByToEntityIds(allSelectableIds, BOUNTIES_RELATION_TYPE)),
  });

  const { data: bountyPersonalSubmissionRelations = [] } = useQuery({
    queryKey: ['bounty-submission-relations-p', allSelectableIds, personalSpaceId],
    enabled: isAuthor && isOpen && allSelectableIds.length > 0 && Boolean(personalSpaceId),
    staleTime: 60_000,
    queryFn: () => {
      if (!personalSpaceId) return Promise.resolve([]);
      return Effect.runPromise(
        getRelationsByToEntityIds(allSelectableIds, BOUNTIES_RELATION_TYPE, personalSpaceId)
      );
    },
  });

  const submissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const rel of bountySubmissionRelations) {
      const id = (rel as { toEntityId?: string }).toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bountySubmissionRelations]);

  const personalSubmissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const rel of bountyPersonalSubmissionRelations) {
      const id = (rel as { toEntityId?: string }).toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bountyPersonalSubmissionRelations]);

  const linkableBounties = React.useMemo((): Bounty[] => {
    if (!isAuthor || !personalSpaceId) return [];
    const allocationTargets = buildBountyAllocationTargets(personalSpaceId, personalPageEntityId);
    return remoteBountyEntities
      .filter(
        e =>
          isAllocatedToUser(e.relations ?? [], allocationTargets) &&
          !hasBountyTaskStatusDoneRelation(e.relations ?? [])
      )
      .map(entity => {
        const bountySpaceId = entity.spaces?.[0] ?? daoSpaceId;
        return buildBounty(
          entity.id,
          entity.values ?? [],
          entity.relations ?? [],
          submissionCounts,
          personalSubmissionCounts,
          bountySpaceId,
          personalSpaceId
        );
      });
  }, [
    isAuthor,
    personalSpaceId,
    personalPageEntityId,
    remoteBountyEntities,
    daoSpaceId,
    submissionCounts,
    personalSubmissionCounts,
  ]);

  const { data: linkedBountyDetails = [], isLoading: isLoadingLinkedEntities } = useQuery({
    queryKey: ['proposal-linked-bounty-entities', linkedBountyIds.join(','), daoSpaceId, authorSpaceId],
    enabled: n > 0,
    queryFn: async () => {
      const entities = await Promise.all(linkedBountyIds.map(id => Effect.runPromise(getEntity(id, daoSpaceId))));
      return entities.filter((e): e is NonNullable<typeof e> => e !== null);
    },
  });

  const linkedBountiesFromGraph = React.useMemo((): Bounty[] => {
    if (linkedBountyDetails.length === 0) return [];
    return linkedBountyDetails.map(e =>
      buildBounty(
        e.id,
        e.values as Value[],
        e.relations,
        new Map(),
        new Map(),
        e.spaces[0] ?? daoSpaceId,
        authorSpaceId
      )
    );
  }, [authorSpaceId, daoSpaceId, linkedBountyDetails]);

  const bountySpaceIdsForLabels = React.useMemo(() => {
    const s = new Set<string>();
    for (const b of linkableBounties) {
      if (b.spaceId) s.add(b.spaceId);
    }
    for (const b of linkedBountiesFromGraph) {
      if (b.spaceId) s.add(b.spaceId);
    }
    return [...s].sort();
  }, [linkableBounties, linkedBountiesFromGraph]);

  const { data: bountyLabelSpaces = [] } = useQuery({
    queryKey: ['bounty-space-labels', bountySpaceIdsForLabels.join(',')],
    enabled: isOpen && bountySpaceIdsForLabels.length > 0,
    staleTime: 60_000,
    queryFn: () => Effect.runPromise(getSpaces({ spaceIds: bountySpaceIdsForLabels })),
  });

  const bountySpaceRowById = React.useMemo(() => {
    const m = new Map<string, { label: string; image: string }>();
    for (const id of bountySpaceIdsForLabels) {
      const found = bountyLabelSpaces.find(s => s.id === id);
      const name = found?.entity?.name?.trim();
      const label = name && name.length > 0 ? name : bountySpaceFallbackLabel(id);
      const image =
        found?.entity?.image && found.entity.image.length > 0 ? found.entity.image : PLACEHOLDER_SPACE_IMAGE;
      m.set(id, { label, image });
    }
    return m;
  }, [bountyLabelSpaces, bountySpaceIdsForLabels]);

  const linkableBountiesLabeled = React.useMemo((): Bounty[] => {
    return linkableBounties.map(b => {
      const row = b.spaceId ? bountySpaceRowById.get(b.spaceId) : undefined;
      return {
        ...b,
        spaceLabel: b.spaceId ? (row?.label ?? bountySpaceFallbackLabel(b.spaceId)) : null,
        spaceImage: b.spaceId ? (row?.image ?? PLACEHOLDER_SPACE_IMAGE) : null,
      };
    });
  }, [bountySpaceRowById, linkableBounties]);

  const linkableById = React.useMemo(
    () => new Map<string, Bounty>(linkableBountiesLabeled.map(b => [b.id, b])),
    [linkableBountiesLabeled]
  );

  const linkedBountiesLabeled = React.useMemo((): Bounty[] => {
    return linkedBountiesFromGraph.map(b => {
      const row = b.spaceId ? bountySpaceRowById.get(b.spaceId) : undefined;
      return {
        ...b,
        spaceLabel: b.spaceId ? (row?.label ?? bountySpaceFallbackLabel(b.spaceId)) : null,
        spaceImage: b.spaceId ? (row?.image ?? PLACEHOLDER_SPACE_IMAGE) : null,
      };
    });
  }, [bountySpaceRowById, linkedBountiesFromGraph]);

  const linkedById = React.useMemo(
    () => new Map<string, Bounty>(linkedBountiesLabeled.map(b => [b.id, b])),
    [linkedBountiesLabeled]
  );

  const bountyInfoById = React.useMemo(() => {
    const m = new Map<string, Bounty>();
    for (const [id, b] of linkableById) m.set(id, b);
    for (const [id, b] of linkedById) m.set(id, b);
    return m;
  }, [linkableById, linkedById]);

  const availableBounties = React.useMemo(
    () => linkableBountiesLabeled.filter(b => !draftIds.has(b.id)),
    [linkableBountiesLabeled, draftIds]
  );

  const draftBounties = React.useMemo(() => {
    return Array.from(draftIds)
      .map(id => bountyInfoById.get(id))
      .filter((b): b is Bounty => b !== undefined);
  }, [bountyInfoById, draftIds]);

  const wasPanelOpen = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !wasPanelOpen.current) {
      setDraftIds(new Set(linkedBountyIds));
    }
    wasPanelOpen.current = isOpen;
  }, [isOpen, linkedBountyIds]);

  const hasUnsaved = React.useMemo(() => {
    if (draftIds.size !== linkedBountyIds.length) return true;
    return !linkedBountyIds.every(id => draftIds.has(id));
  }, [draftIds, linkedBountyIds]);

  const toggleDraft = (id: string) => {
    setDraftIds(prev => {
      const nxt = new Set(prev);
      if (nxt.has(id)) nxt.delete(id);
      else nxt.add(id);
      return nxt;
    });
  };

  const onSave = async () => {
    if (!isAuthor || !personalSpaceId || !smartAccount) return;
    if (!hasUnsaved) return;

    const toRemove = linkedBountyIds.filter(id => !draftIds.has(id));
    const toAdd = [...draftIds].filter(id => !relationByBountyId.has(id));
    if (toRemove.length === 0 && toAdd.length === 0) return;

    setIsSaving(true);
    const name = proposalName.trim() || 'Proposal';
    const bountyTargetSpace = personalSpaceId !== daoSpaceId ? daoSpaceId : undefined;

    const newRelations: Relation[] = [];
    for (const id of toAdd) {
      const bounty = bountyInfoById.get(id);
      if (!bounty) continue;
      newRelations.push({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        spaceId: personalSpaceId,
        ...(bountyTargetSpace ? { toSpaceId: bountyTargetSpace } : {}),
        renderableType: 'RELATION',
        verified: false,
        position: Position.generate(),
        isLocal: true,
        hasBeenPublished: false,
        isDeleted: false,
        type: { id: BOUNTIES_RELATION_TYPE, name: 'Bounties' },
        fromEntity: { id: proposalId, name },
        toEntity: { id: bounty.id, name: bounty.name, value: bounty.id },
      });
    }

    const removeRelations: Relation[] = toRemove
      .map(id => {
        const r = relationByBountyId.get(id);
        if (!r) return null;
        return { ...r, isDeleted: true, isLocal: true } as Relation;
      })
      .filter((r): r is Relation => r !== null);

    const needsBootstrap = linkedRelations.length === 0 && toAdd.length > 0;

    const values: Value[] = [];
    if (needsBootstrap) {
      values.push({
        id: ID.createValueId({
          entityId: proposalId,
          propertyId: SystemIds.NAME_PROPERTY,
          spaceId: personalSpaceId,
        }),
        entity: { id: proposalId, name },
        property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
        spaceId: personalSpaceId,
        value: name,
        isLocal: true,
        isDeleted: false,
        hasBeenPublished: false,
        timestamp: new Date().toISOString(),
      });
    }

    const proposalTypeRelation: Relation = {
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId: personalSpaceId,
      renderableType: 'RELATION' as const,
      verified: false,
      position: Position.generate(),
      isLocal: true,
      hasBeenPublished: false,
      isDeleted: false,
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: proposalId, name },
      toEntity: { id: PROPOSAL_TYPE_ID, name: 'Proposal', value: PROPOSAL_TYPE_ID },
    };

    const relations: Relation[] = needsBootstrap
      ? [proposalTypeRelation, ...newRelations, ...removeRelations]
      : [...newRelations, ...removeRelations];

    try {
      await makeProposal({
        values,
        relations,
        spaceId: personalSpaceId,
        name: needsBootstrap ? `Bounty links for: ${name}` : `Update bounty links: ${name}`,
        onError: () => {},
      });
      await queryClient.invalidateQueries({ queryKey: ['proposal-bounty-relations', proposalId, authorSpaceId] });
      await queryClient.invalidateQueries({ queryKey: ['proposal-linked-bounty-entities'] });
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!showBounties) return null;

  const headLabel = isAuthor && n === 0 ? 'Link to bounty' : String(n);
  const showSave = isAuthor && hasUnsaved;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cx(
          'group inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded border px-2 py-2 text-button font-normal transition-colors',
          'border-grey-02 bg-white text-text hover:border-text'
        )}
        title="Bounties"
      >
        <Gem color="purple" />
        <span>{headLabel}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-60" role="dialog" aria-modal="true" aria-label="Bounties">
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/20"
            aria-label="Close"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={cx(
              'absolute z-10 flex h-full w-full max-w-[400px] flex-col overflow-hidden border-l border-divider bg-white',
              'right-0 top-0'
            )}
          >
            <div className="flex items-center justify-between border-b border-grey-02 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-purple">
                  <Gem color="purple" />
                </span>
                <span className="truncate text-body text-text">Bounties</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isAuthor && showSave && (
                  <Button variant="primary" onClick={onSave} disabled={isSaving || !smartAccount} className="!min-h-8">
                    <Pending isPending={isSaving}>Save changes</Pending>
                  </Button>
                )}
                <SquareButton onClick={() => setIsOpen(false)} icon={<Close />} />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!isAuthor && n === 0 && <p className="text-body text-grey-04">No bounties linked</p>}

              {!isAuthor && n > 0 && isLoadingLinkedEntities && (
                <p className="text-body text-grey-04">Loading bounties…</p>
              )}

              {!isAuthor && n > 0 && !isLoadingLinkedEntities && (
                <ul className="flex flex-col divide-y divide-grey-02">
                  {linkedBountiesLabeled.map(b => (
                    <li key={b.id} className="list-none py-2">
                      <BountyReadOnly bounty={b} />
                    </li>
                  ))}
                </ul>
              )}

              {isAuthor && isLoadingLinks && n === 0 && <p className="text-body text-grey-04">Loading links…</p>}

              {isAuthor && !isLoadingLinks && n === 0 && (
                <div className="flex flex-col divide-y divide-grey-02">
                  {linkableBountiesLabeled.length === 0 ? (
                    <p className="text-body text-grey-04">No allocated bounties available to link in current space</p>
                  ) : (
                    linkableBountiesLabeled.map(b => (
                      <BountyCard
                        key={b.id}
                        bounty={b}
                        isSelected={draftIds.has(b.id)}
                        onToggle={toggleDraft}
                      />
                    ))
                  )}
                </div>
              )}

              {isAuthor && n > 0 && isLoadingLinks && <p className="text-body text-grey-04">Loading links…</p>}

              {isAuthor && n > 0 && !isLoadingLinks && (
                <div className="flex flex-col gap-8">
                  <section>
                    <h3 className="mb-2 text-metadata font-medium text-text">Linked</h3>
                    {draftBounties.length === 0 ? (
                      <p className="text-body text-grey-04">No bounties selected</p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-grey-02">
                        {draftBounties.map(b => (
                          <BountyWithRemove
                            key={b.id}
                            bounty={b}
                            onRemove={() => {
                              toggleDraft(b.id);
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-2 text-metadata font-medium text-text">Available</h3>
                    {availableBounties.length === 0 ? (
                      <p className="text-body text-grey-04">No other allocated bounties in this space</p>
                    ) : (
                      <div className="flex flex-col divide-y divide-grey-02">
                        {availableBounties.map(b => (
                          <BountyCard
                            key={b.id}
                            bounty={b}
                            isSelected={false}
                            onToggle={toggleDraft}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BountyWithRemove({ bounty, onRemove }: { bounty: Bounty; onRemove: () => void }) {
  return (
    <li className="list-none">
      <div className="flex items-start justify-between gap-2 py-2">
        <BountyReadOnly bounty={bounty} />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-grey-04 hover:bg-grey-01 hover:text-text"
          aria-label={`Unlink ${bounty.name}`}
        >
          <Close />
        </button>
      </div>
    </li>
  );
}

function BountyReadOnly({ bounty }: { bounty: Bounty }) {
  return (
    <div>
      {bounty.spaceLabel && (
        <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[14px] text-text">
          <span className="relative inline-flex size-[14px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-03 bg-grey-01">
            <NativeGeoImage value={bounty.spaceImage ?? PLACEHOLDER_SPACE_IMAGE} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="min-w-0 truncate">{bounty.spaceLabel}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => bounty.spaceId && window.open(NavUtils.toEntity(bounty.spaceId, bounty.id), '_blank', 'noopener,noreferrer')}
        className="text-left text-[15px] font-semibold text-text hover:underline"
      >
        {bounty.name}
      </button>
    </div>
  );
}

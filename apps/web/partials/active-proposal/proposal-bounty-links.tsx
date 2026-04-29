'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import { BOUNTIES_RELATION_TYPE, BOUNTY_TYPE_ID, PLACEHOLDER_SPACE_IMAGE, PROPOSAL_TYPE_ID } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { ID } from '~/core/id';
import {
  getAllEntities,
  getRelationsByFromEntityId,
  getRelationsByToEntityIds,
  getSpace,
  getSpaces,
} from '~/core/io/queries';
import { fetchSpaceWithParents } from '~/core/io/subgraph/fetch-space-with-parents';
import { useStatusBar } from '~/core/state/status-bar-store';
import type { Relation, Value } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { NativeGeoImage } from '~/design-system/geo-image';
import { ChevronDown } from '~/design-system/icons/chevron-down';
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

type ProviderProps = {
  daoSpaceId: string;
  proposalId: string;
  proposalName: string;
  authorSpaceId: string;
  children: React.ReactNode;
};

function bountySpaceFallbackLabel(spaceId: string): string {
  const compact = spaceId.replace(/-/g, '');
  return compact.length > 14 ? `${compact.slice(0, 6)}…${compact.slice(-4)}` : spaceId;
}

function spaceIdsEqual(a: string, b: string): boolean {
  return a.replace(/^0x/i, '').toLowerCase() === b.replace(/^0x/i, '').toLowerCase();
}

type ContextValue = {
  showBounties: boolean;
  isAuthor: boolean;
  smartAccountReady: boolean;
  hasUnsaved: boolean;
  isSaving: boolean;
  n: number;
  isLoadingLinks: boolean;
  isLoadingLinkedEntities: boolean;
  isLoadingAvailable: boolean;
  draftBounties: Bounty[];
  availableBounties: Bounty[];
  linkedBountiesLabeled: Bounty[];
  linkableBountiesLabeled: Bounty[];
  toggleDraft: (id: string) => void;
  onSave: () => Promise<void>;
  isPanelOpen: boolean;
  togglePanel: () => void;
};

const Context = React.createContext<ContextValue | null>(null);

function useBounties(): ContextValue | null {
  return React.useContext(Context);
}

export function ProposalBountiesProvider({
  daoSpaceId,
  proposalId,
  proposalName,
  authorSpaceId,
  children,
}: ProviderProps) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile } = useGeoProfile(address);
  const personalPageEntityId = profile?.id ?? null;
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const { dispatch: dispatchStatusBar } = useStatusBar();

  const isAuthor = Boolean(
    personalSpaceId && personalSpaceId.length > 0 && spaceIdsEqual(personalSpaceId, authorSpaceId)
  );

  const [draftIds, setDraftIds] = React.useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = React.useState(false);
  const [optimisticLinkedIds, setOptimisticLinkedIds] = React.useState<string[] | null>(null);
  const [isPanelOpen, setIsPanelOpen] = React.useState(false);

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

  const linkedBountyIds = React.useMemo(() => [...relationByBountyId.keys()].sort(), [relationByBountyId]);

  const effectiveLinkedIds = React.useMemo(() => {
    if (!optimisticLinkedIds) return linkedBountyIds;
    return [...optimisticLinkedIds].sort();
  }, [optimisticLinkedIds, linkedBountyIds]);

  React.useEffect(() => {
    if (!optimisticLinkedIds) return;
    const a = [...optimisticLinkedIds].sort();
    const b = linkedBountyIds;
    if (a.length === b.length && a.every((id, i) => id === b[i])) {
      setOptimisticLinkedIds(null);
    }
  }, [optimisticLinkedIds, linkedBountyIds]);

  const n = effectiveLinkedIds.length;

  const { data: proposalTypeRelations = [] } = useQuery({
    queryKey: ['proposal-types-relations', proposalId, personalSpaceId],
    enabled: Boolean(personalSpaceId) && showBounties && isAuthor,
    staleTime: 30_000,
    queryFn: () => {
      if (!personalSpaceId) return Promise.resolve([]);
      return Effect.runPromise(getRelationsByFromEntityId(proposalId, SystemIds.TYPES_PROPERTY, personalSpaceId));
    },
  });

  const hasProposalTypeRelation = React.useMemo(
    () => proposalTypeRelations.some(r => r.toEntity.id === PROPOSAL_TYPE_ID),
    [proposalTypeRelations]
  );

  const { data: bountySearchSpaceIds = [], isLoading: isLoadingSpaces } = useQuery({
    queryKey: ['bounty-link-spaces-with-parents', daoSpaceId],
    enabled: showBounties && isAuthor && isPanelOpen,
    staleTime: 60_000,
    queryFn: () => fetchSpaceWithParents(daoSpaceId),
  });

  const { data: remoteBountyEntities = [], isLoading: isLoadingRemote } = useQuery({
    queryKey: ['bounties-by-type', bountySearchSpaceIds.join(','), BOUNTY_TYPE_ID, 'gov-panel'],
    enabled: isAuthor && showBounties && isPanelOpen && bountySearchSpaceIds.length > 0,
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
    enabled: isAuthor && isPanelOpen && allSelectableIds.length > 0,
    staleTime: 60_000,
    queryFn: () => Effect.runPromise(getRelationsByToEntityIds(allSelectableIds, BOUNTIES_RELATION_TYPE)),
  });

  const { data: bountyPersonalSubmissionRelations = [] } = useQuery({
    queryKey: ['bounty-submission-relations-p', allSelectableIds, personalSpaceId],
    enabled: isAuthor && isPanelOpen && allSelectableIds.length > 0 && Boolean(personalSpaceId),
    staleTime: 60_000,
    queryFn: () => {
      if (!personalSpaceId) return Promise.resolve([]);
      return Effect.runPromise(getRelationsByToEntityIds(allSelectableIds, BOUNTIES_RELATION_TYPE, personalSpaceId));
    },
  });

  const submissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const rel of bountySubmissionRelations) {
      if (!rel.toEntityId) continue;
      counts.set(rel.toEntityId, (counts.get(rel.toEntityId) ?? 0) + 1);
    }
    return counts;
  }, [bountySubmissionRelations]);

  const personalSubmissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const rel of bountyPersonalSubmissionRelations) {
      if (!rel.toEntityId) continue;
      counts.set(rel.toEntityId, (counts.get(rel.toEntityId) ?? 0) + 1);
    }
    return counts;
  }, [bountyPersonalSubmissionRelations]);

  const linkableBounties = React.useMemo((): Bounty[] => {
    if (!isAuthor || !personalSpaceId) return [];
    const allocationTargets = buildBountyAllocationTargets(personalSpaceId, personalPageEntityId);
    return remoteBountyEntities
      .filter(
        e =>
          isAllocatedToUser(e.relations ?? [], allocationTargets) && !hasBountyTaskStatusDoneRelation(e.relations ?? [])
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
    queryKey: ['proposal-linked-bounty-entities', effectiveLinkedIds.join(',')],
    enabled: isPanelOpen && n > 0,
    queryFn: () => Effect.runPromise(getAllEntities({ filter: { id: { in: effectiveLinkedIds } } })),
  });

  const linkedBountiesFromGraph = React.useMemo((): Bounty[] => {
    if (linkedBountyDetails.length === 0) return [];
    return linkedBountyDetails.map(e =>
      buildBounty(
        e.id,
        e.values as Value[],
        e.relations,
        submissionCounts,
        personalSubmissionCounts,
        e.spaces[0] ?? daoSpaceId,
        authorSpaceId
      )
    );
  }, [authorSpaceId, daoSpaceId, linkedBountyDetails, submissionCounts, personalSubmissionCounts]);

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
    enabled: bountySpaceIdsForLabels.length > 0,
    staleTime: 60_000,
    queryFn: () => Effect.runPromise(getSpaces({ spaceIds: bountySpaceIdsForLabels })),
  });

  const bountySpaceRowById = React.useMemo(() => {
    const bountyLabelSpacesById = new Map(bountyLabelSpaces.map(space => [space.id, space]));
    const m = new Map<string, { label: string; image: string }>();
    for (const id of bountySpaceIdsForLabels) {
      const found = bountyLabelSpacesById.get(id);
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

  // Already-linked bounties may no longer be "linkable" (e.g. allocation removed
  // or task status flipped to Done after linking). Include them so a user who
  // unticks one before saving can re-tick it instead of losing it from the panel.
  const selectableBounties = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: Bounty[] = [];
    for (const bounty of linkableBountiesLabeled) {
      seen.add(bounty.id);
      merged.push(bounty);
    }
    for (const bounty of linkedBountiesLabeled) {
      if (seen.has(bounty.id)) continue;
      seen.add(bounty.id);
      merged.push(bounty);
    }
    return merged;
  }, [linkableBountiesLabeled, linkedBountiesLabeled]);

  const availableBounties = React.useMemo(
    () => selectableBounties.filter(b => !draftIds.has(b.id)),
    [selectableBounties, draftIds]
  );

  const draftBounties = React.useMemo(() => {
    return Array.from(draftIds)
      .map(id => bountyInfoById.get(id))
      .filter((b): b is Bounty => b !== undefined);
  }, [bountyInfoById, draftIds]);

  // Sync drafts to effective linked ids when they change (initial mount, after save).
  // Layout effect so the sync runs before paint and we don't briefly show the
  // Publish CTA on the first post-fetch render before drafts catch up.
  const lastSyncedKey = React.useRef<string>('');
  React.useLayoutEffect(() => {
    const key = effectiveLinkedIds.join(',');
    if (key === lastSyncedKey.current) return;
    // Only sync when there are no in-flight (unsaved) modifications relative to the previous server state.
    // Advance lastSyncedKey only when we actually apply the sync, so the
    // "no edits since sync" check stays correct across subsequent server changes.
    setDraftIds(prev => {
      const prevKey = [...prev].sort().join(',');
      if (prevKey === lastSyncedKey.current) {
        lastSyncedKey.current = key;
        return new Set(effectiveLinkedIds);
      }
      return prev;
    });
  }, [effectiveLinkedIds]);

  const hasUnsaved = React.useMemo(() => {
    if (draftIds.size !== effectiveLinkedIds.length) return true;
    return !effectiveLinkedIds.every(id => draftIds.has(id));
  }, [draftIds, effectiveLinkedIds]);

  const toggleDraft = React.useCallback((id: string) => {
    setDraftIds(prev => {
      const nxt = new Set(prev);
      if (nxt.has(id)) nxt.delete(id);
      else nxt.add(id);
      return nxt;
    });
  }, []);

  const togglePanel = React.useCallback(() => {
    setIsPanelOpen(prev => {
      const next = !prev;
      if (!next) {
        // Closing the panel discards any unsaved drafts.
        setDraftIds(new Set(effectiveLinkedIds));
      }
      return next;
    });
  }, [effectiveLinkedIds]);

  const isLoadingAvailable = isAuthor && (isLoadingSpaces || isLoadingRemote);

  const onSave = React.useCallback(async () => {
    if (!isAuthor || !personalSpaceId || !smartAccount) return;
    if (!hasUnsaved) return;

    const toRemove = effectiveLinkedIds.filter(id => !draftIds.has(id));
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
    const needsTypeRelation = !hasProposalTypeRelation && toAdd.length > 0;

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

    const relations: Relation[] = needsTypeRelation
      ? [proposalTypeRelation, ...newRelations, ...removeRelations]
      : [...newRelations, ...removeRelations];

    let didComplete = false;
    try {
      await makeProposal({
        values,
        relations,
        spaceId: personalSpaceId,
        name: needsBootstrap ? `Bounty links for: ${name}` : `Update bounty links: ${name}`,
        onSuccess: () => {
          didComplete = true;
          setOptimisticLinkedIds([...draftIds]);
          queryClient.invalidateQueries({ queryKey: ['proposal-bounty-relations', proposalId, authorSpaceId] });
          queryClient.invalidateQueries({ queryKey: ['proposal-linked-bounty-entities'] });
          queryClient.invalidateQueries({ queryKey: ['proposal-types-relations', proposalId, personalSpaceId] });
        },
        onError: () => {
          didComplete = true;
        },
      });
      // makeProposal can return early without firing either callback (e.g. the
      // resolved space is missing or prepared ops are empty). Surface a status
      // bar error so the click doesn't appear to succeed silently.
      if (!didComplete) {
        dispatchStatusBar({ type: 'ERROR', payload: 'Could not save bounty links. Please try again.' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    isAuthor,
    personalSpaceId,
    smartAccount,
    hasUnsaved,
    effectiveLinkedIds,
    draftIds,
    relationByBountyId,
    proposalName,
    daoSpaceId,
    bountyInfoById,
    linkedRelations.length,
    hasProposalTypeRelation,
    makeProposal,
    queryClient,
    proposalId,
    authorSpaceId,
    dispatchStatusBar,
  ]);

  const value = React.useMemo<ContextValue>(
    () => ({
      showBounties,
      isAuthor,
      smartAccountReady: Boolean(smartAccount),
      hasUnsaved,
      isSaving,
      n,
      isLoadingLinks,
      isLoadingLinkedEntities,
      isLoadingAvailable,
      draftBounties,
      availableBounties,
      linkedBountiesLabeled,
      linkableBountiesLabeled,
      toggleDraft,
      onSave,
      isPanelOpen,
      togglePanel,
    }),
    [
      showBounties,
      isAuthor,
      smartAccount,
      hasUnsaved,
      isSaving,
      n,
      isLoadingLinks,
      isLoadingLinkedEntities,
      isLoadingAvailable,
      draftBounties,
      availableBounties,
      linkedBountiesLabeled,
      linkableBountiesLabeled,
      toggleDraft,
      onSave,
      isPanelOpen,
      togglePanel,
    ]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ProposalBountyHeadButton() {
  const ctx = useBounties();
  if (!ctx || !ctx.showBounties) return null;
  const { isAuthor, hasUnsaved, isSaving, smartAccountReady, n, onSave, isPanelOpen, togglePanel } = ctx;

  // Non-authors only see the pill when there are linked bounties to view.
  if (!isAuthor && n === 0) return null;

  return (
    <>
      {isAuthor && hasUnsaved ? (
        <Button variant="primary" small onClick={onSave} disabled={isSaving || !smartAccountReady}>
          <Pending isPending={isSaving}>
            <span className="inline-flex items-center gap-1.5">
              <Gem color="white" strokeColor="#3963FE" />
              Publish
            </span>
          </Pending>
        </Button>
      ) : (
        <button
          type="button"
          onClick={togglePanel}
          className={cx(
            'inline-flex h-6 shrink-0 items-center gap-1.5 rounded border px-1.5 text-metadata leading-none text-text transition-colors',
            'border-grey-02 bg-white hover:border-text'
          )}
          title="Bounties"
          aria-expanded={isPanelOpen}
        >
          <Gem color="purple" />
          <span>{isAuthor && n === 0 ? 'Link to bounty' : String(n)}</span>
        </button>
      )}
      <span aria-hidden className="h-4 w-px shrink-0 self-center bg-grey-02 last:hidden" />
    </>
  );
}

export function ProposalBountyPanel() {
  const ctx = useBounties();
  const [linkedExpanded, setLinkedExpanded] = React.useState(true);
  const [availableExpanded, setAvailableExpanded] = React.useState(true);

  if (!ctx || !ctx.showBounties || !ctx.isPanelOpen) return null;
  const {
    isAuthor,
    n,
    isLoadingLinks,
    isLoadingLinkedEntities,
    isLoadingAvailable,
    draftBounties,
    availableBounties,
    linkedBountiesLabeled,
    linkableBountiesLabeled,
    toggleDraft,
  } = ctx;

  const linkedCount = isAuthor ? draftBounties.length : linkedBountiesLabeled.length;
  const availableCount = availableBounties.length;
  const pluralize = (count: number) => (count === 1 ? 'bounty' : 'bounties');

  return (
    <aside
      className="sticky top-[52px] flex h-[calc(100vh-60px)] w-full max-w-[400px] shrink-0 flex-col self-start"
      aria-label="Bounties"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-grey-02 bg-white">
        {!isAuthor && (
          <>
            <div className="px-5 py-4">
              <SectionHeader label={`${n} ${pluralize(n)} linked`} />
            </div>
            <div className="border-t border-grey-02">
              {n === 0 ? (
                <p className="px-5 py-4 text-metadataMedium text-grey-04">No bounties linked</p>
              ) : isLoadingLinkedEntities ? (
                <p className="px-5 py-4 text-metadataMedium text-grey-04">Loading bounties…</p>
              ) : (
                <ul className="flex flex-col divide-y divide-grey-02 px-5">
                  {linkedBountiesLabeled.map(b => (
                    <li key={b.id} className="list-none py-2">
                      <BountyReadOnly bounty={b} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {isAuthor && (
          <>
            <CollapsibleSectionHeader
              label={`${linkedCount} ${pluralize(linkedCount)} linked`}
              expanded={linkedExpanded}
              onToggle={() => setLinkedExpanded(v => !v)}
            />
            {linkedExpanded && (
              <div className="border-t border-grey-02">
                {(isLoadingLinks || isLoadingLinkedEntities) && draftBounties.length === 0 ? (
                  <p className="px-5 py-4 text-metadataMedium text-grey-04">Loading links…</p>
                ) : draftBounties.length === 0 ? (
                  <p className="px-5 py-4 text-metadataMedium text-grey-04">No bounties linked</p>
                ) : (
                  <div className="flex flex-col divide-y divide-grey-02 px-5">
                    {draftBounties.map(b => (
                      <BountyCard key={b.id} bounty={b} isSelected onToggle={toggleDraft} />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-grey-02">
              <CollapsibleSectionHeader
                label={`${availableCount} ${pluralize(availableCount)} available`}
                expanded={availableExpanded}
                onToggle={() => setAvailableExpanded(v => !v)}
              />
            </div>
            {availableExpanded && (
              <div className="border-t border-grey-02">
                {isLoadingAvailable ? (
                  <p className="px-5 py-4 text-metadataMedium text-grey-04">Loading bounties…</p>
                ) : availableBounties.length === 0 ? (
                  <p className="px-5 py-4 text-metadataMedium text-grey-04">
                    {linkableBountiesLabeled.length === 0
                      ? 'No allocated bounties available to link in current space'
                      : 'No other allocated bounties in this space'}
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-grey-02 px-5">
                    {availableBounties.map(b => (
                      <BountyCard key={b.id} bounty={b} isSelected={false} onToggle={toggleDraft} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-purple">
        <Gem color="purple" />
      </span>
      <span className="text-metadataMedium text-text">{label}</span>
    </span>
  );
}

function CollapsibleSectionHeader({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-grey-01"
      aria-expanded={expanded}
    >
      <SectionHeader label={label} />
      <span className={cx('text-grey-04 transition-transform', expanded ? 'rotate-180' : 'rotate-0')}>
        <ChevronDown />
      </span>
    </button>
  );
}

function BountyReadOnly({ bounty }: { bounty: Bounty }) {
  return (
    <div>
      {bounty.spaceLabel && (
        <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[14px] text-text">
          <span className="relative inline-flex size-[14px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-03 bg-grey-01">
            <NativeGeoImage
              value={bounty.spaceImage ?? PLACEHOLDER_SPACE_IMAGE}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0 truncate">{bounty.spaceLabel}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          bounty.spaceId && window.open(NavUtils.toEntity(bounty.spaceId, bounty.id), '_blank', 'noopener,noreferrer')
        }
        className="text-left text-[15px] font-semibold text-text hover:underline"
      >
        {bounty.name}
      </button>
    </div>
  );
}

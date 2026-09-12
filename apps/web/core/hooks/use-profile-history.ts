'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';
import { entityAvatarsQueryKey, fetchEntityAvatars } from '~/core/io/subgraph/fetch-entity-avatars';
import { fetchProfileHistory, profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import {
  DEGREE_PROPERTY,
  EDUCATION_PROPERTY,
  EMPLOYMENT_PROPERTY,
  ROLES_PROPERTY,
} from '~/core/profile/history-ontology';
import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';
import {
  NOTHING_PENDING,
  type PendingHistory,
  type PendingRemoval,
  dropPendingAddition,
  hasPendingChanges,
  isPending,
  mergePendingEducation,
  mergePendingEmployment,
  pendingDraftFor,
  pendingOrganizationIds,
  replacePendingAddition,
  shareStintsByOrganization,
} from '~/core/profile/pending-history';
import {
  type EducationDraft,
  type PositionDraft,
  type StagedRows,
  stageEducation,
  stagePosition,
} from '~/core/profile/stage-history';
import type { Relation, Value } from '~/core/types';

type Params = { entityId: string; spaceId: string; enabled?: boolean };

type Kind = 'employment' | 'education';

const PROPERTIES: Record<Kind, { entry: string; card: string }> = {
  employment: { entry: ROLES_PROPERTY, card: EMPLOYMENT_PROPERTY },
  education: { entry: DEGREE_PROPERTY, card: EDUCATION_PROPERTY },
};

/**
 * Work and education on the viewer's own profile (GEO-2858).
 *
 * Nothing here writes on its own. Adding a position, editing one, adding a degree
 * and removing either are collected, and the modal's Save publishes them
 * alongside the four header fields as a single edit — so correcting four things
 * costs one ~10s wait rather than four, and nothing lands until the user says so.
 *
 * The resting state shows saved records merged with whatever is still pending, so
 * the list reads as the profile they are about to have.
 */
export function useProfileHistory({ entityId, spaceId, enabled = true }: Params) {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<PendingHistory>(NOTHING_PENDING);

  const queryKey = profileHistoryQueryKey(entityId);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: enabled && entityId !== '',
    queryFn: () => fetchProfileHistory(entityId),
    staleTime: 60_000,
  });

  /**
   * Logos for employers and schools a pending row names.
   *
   * The profile read collects these on its way past an edge; a row being added
   * has no edge yet. Without this a card showed an initial before saving and a
   * logo afterwards, which made the merged view look like it was guessing.
   */
  const pendingOrgIds = React.useMemo(() => pendingOrganizationIds(pending), [pending]);

  const { data: pendingAvatars } = useQuery({
    queryKey: entityAvatarsQueryKey(pendingOrgIds),
    enabled: pendingOrgIds.length > 0,
    queryFn: () => fetchEntityAvatars(pendingOrgIds),
    staleTime: 60_000,
  });

  const addPosition = React.useCallback((draft: PositionDraft) => {
    setPending(current => ({
      ...current,
      positions: [...current.positions, { key: ID.createEntityId(), draft }],
    }));
  }, []);

  const addEducation = React.useCallback((draft: EducationDraft) => {
    setPending(current => ({
      ...current,
      education: [...current.education, { key: ID.createEntityId(), draft }],
    }));
  }, []);

  /**
   * What removing one row costs: the row itself, and the organisation edge it
   * hung off once nothing saved is left under it.
   *
   * Counted over that row's own edge rather than the whole card — a card can
   * group several edges to one employer, and a sibling under a different edge
   * cannot keep this one alive.
   */
  const removalsFor = React.useCallback((card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: Kind) => {
    const properties = PROPERTIES[kind];

    const savedSiblings = card.entries.filter(
      other =>
        other.relationId !== entry.relationId &&
        other.edge.stintId === entry.edge.stintId &&
        !isPending(other.relationId)
    );

    const removals: PendingRemoval[] = [
      {
        relationId: entry.relationId,
        entityId: entry.tenureId,
        typeId: properties.entry,
        subtree: entry.subtree,
      },
    ];

    if (savedSiblings.length === 0 && !isPending(entry.edge.relationId)) {
      removals.push({
        relationId: entry.edge.relationId,
        entityId: entry.edge.stintId,
        typeId: properties.card,
        subtree: entry.edge.subtree,
      });
    }

    return removals;
  }, []);

  const removeEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: Kind) => {
      // Never written, so there is nothing to delete — just forget it.
      if (isPending(entry.relationId)) {
        setPending(current => dropPendingAddition(current, entry.relationId));
        return;
      }

      const removals = removalsFor(card, entry, kind);
      setPending(current => ({ ...current, removals: [...current.removals, ...removals] }));
    },
    [removalsFor]
  );

  /**
   * Editing a saved row is a replacement: the old row goes, a new one takes its
   * place under the same employer.
   *
   * The tenure is an anonymous relation entity that nothing else points at, so
   * rewriting it and minting a fresh one come to the same thing — and a
   * replacement is the only one of the two that can also move the row to a
   * different company, or clear a date that used to be set.
   */
  const editEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: Kind, draft: PositionDraft | EducationDraft) => {
      if (isPending(entry.relationId)) {
        setPending(current => replacePendingAddition(current, entry.relationId, draft));
        return;
      }

      const organizationId = 'company' in draft ? draft.company.id : draft.school.id;
      const staysPut = organizationId === card.organization.id;

      // Only the row when the employer is unchanged — the edge it hangs off is
      // still wanted, and the replacement attaches straight back to it. What hung
      // off the row goes either way: the replacement writes its own dates and
      // skills, and the old ones are not merged into them.
      const removals = staysPut
        ? [
            {
              relationId: entry.relationId,
              entityId: entry.tenureId,
              typeId: PROPERTIES[kind].entry,
              subtree: entry.subtree,
            },
          ]
        : removalsFor(card, entry, kind);

      const next = { ...draft, existingStintId: staysPut ? entry.edge.stintId : undefined };

      setPending(current => ({
        ...current,
        removals: [...current.removals, ...removals],
        positions:
          kind === 'employment'
            ? [...current.positions, { key: ID.createEntityId(), draft: next as PositionDraft }]
            : current.positions,
        education:
          kind === 'education'
            ? [...current.education, { key: ID.createEntityId(), draft: next as EducationDraft }]
            : current.education,
      }));
    },
    [removalsFor]
  );

  /**
   * Everything pending, as rows for the modal's Save to publish with its own.
   *
   * Deletions are tombstones — rows carrying `isDeleted` — and a removal produces
   * one for the relation plus one for everything on the entity it carries. The
   * publish layer reads only the id off a tombstone, so these carry the minimum a
   * delete needs rather than the row as it stands in the graph.
   */
  const stagePending = React.useCallback((): StagedRows => {
    const context = { personEntityId: entityId, spaceId };
    const mint = () => ID.createEntityId();

    const additions = [
      ...shareStintsByOrganization(pending.positions, mint).map(({ draft, newStintId }) =>
        stagePosition(draft, context, newStintId)
      ),
      ...shareStintsByOrganization(pending.education, mint).map(({ draft, newStintId }) =>
        stageEducation(draft, context, newStintId)
      ),
    ];

    const tombstone = (id: string, typeId: string, ownerId: string): Relation => ({
      id,
      entityId: ownerId,
      spaceId,
      renderableType: 'RELATION',
      isDeleted: true,
      type: { id: typeId, name: null },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: ownerId, name: null, value: ownerId },
    });

    const removedRelations: Relation[] = [];
    const removedValues: Value[] = [];

    for (const removal of pending.removals) {
      removedRelations.push(tombstone(removal.relationId, removal.typeId, removal.entityId));

      // The relation's own entity goes with it. Its type is not known per row
      // here and the publish layer does not read one off a tombstone, so the
      // removal's own type stands in.
      for (const relationId of removal.subtree.relationIds) {
        removedRelations.push(tombstone(relationId, removal.typeId, removal.entityId));
      }

      for (const value of removal.subtree.values) {
        removedValues.push({
          id: value.id,
          entity: { id: removal.entityId, name: null },
          // The publish layer builds an `unset` from the property id and checks
          // only that the data type is not RELATION, which a value never is. The
          // real type is not worth another round trip to state here.
          property: { id: value.propertyId, name: null, dataType: 'TEXT', renderableType: 'TEXT' },
          spaceId,
          value: '',
          isDeleted: true,
        });
      }
    }

    return {
      values: [...additions.flatMap(rows => rows.values), ...removedValues],
      relations: [...additions.flatMap(rows => rows.relations), ...removedRelations],
    };
  }, [entityId, pending, spaceId]);

  /**
   * The draft behind an unsaved row, for the sheet to reopen on.
   *
   * Rebuilding one from the rendered row loses what the row does not show —
   * notably that the company was created here and still needs naming, which is
   * how an employer ended up on a profile as "Untitled".
   */
  const draftFor = React.useCallback(
    (entry: HistoryEntry) => (isPending(entry.relationId) ? pendingDraftFor(pending, entry.relationId) : undefined),
    [pending]
  );

  /** Called once the save lands, so the merged view falls back to the graph's. */
  const settle = React.useCallback(() => {
    setPending(NOTHING_PENDING);
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const discard = React.useCallback(() => setPending(NOTHING_PENDING), []);

  const employment = React.useMemo(
    () => mergePendingEmployment(data?.employment ?? [], pending.positions, pending.removals, pendingAvatars),
    [data?.employment, pending, pendingAvatars]
  );

  const education = React.useMemo(
    () => mergePendingEducation(data?.education ?? [], pending.education, pending.removals, pendingAvatars),
    [data?.education, pending, pendingAvatars]
  );

  return {
    employment: employment as EmploymentCard[],
    education: education as EducationCard[],
    isLoading,
    hasPendingChanges: hasPendingChanges(pending),
    addPosition,
    addEducation,
    removeEntry,
    editEntry,
    draftFor,
    stagePending,
    settle,
    discard,
  };
}

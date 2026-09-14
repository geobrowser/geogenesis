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
 * Organisation edges left with nothing under them once everything queued lands.
 *
 * Worked out from the pending state as it finally stands, rather than when a row
 * is removed, because what hangs off an edge keeps changing after that: an
 * unsaved sibling that was keeping it alive can itself be dropped or moved to
 * another employer, and a row can be added at an employer whose last saved row is
 * already queued to go. Deciding on the way past left an empty Employment edge
 * behind in the first case, and published the new row under a deleted edge in the
 * second.
 *
 * Counted per edge rather than per card: a card can group several edges to one
 * employer, and a row under a different edge cannot keep this one alive.
 */
function orphanedEdges(saved: HistoryCard<HistoryEntry>[], kind: Kind, pending: PendingHistory): PendingRemoval[] {
  const removed = new Set(pending.removals.map(removal => removal.relationId));
  const additions = kind === 'employment' ? pending.positions : pending.education;

  // Every stint something will still hang off afterwards — saved rows that are
  // staying, and unsaved rows that attached themselves to a saved edge.
  const kept = new Set<string>();
  for (const card of saved) {
    for (const entry of card.entries) {
      if (!removed.has(entry.relationId)) kept.add(entry.edge.stintId);
    }
  }
  for (const addition of additions) {
    if (addition.draft.existingStintId) kept.add(addition.draft.existingStintId);
  }

  const orphans: PendingRemoval[] = [];

  for (const card of saved) {
    for (const edge of card.edges) {
      if (kept.has(edge.stintId) || isPending(edge.relationId)) continue;

      // Only an edge this edit emptied. One that arrived already carrying nothing
      // is not ours to tidy up, and deleting it would be a change nobody asked for.
      if (!card.entries.some(entry => entry.edge.stintId === edge.stintId)) continue;

      orphans.push({
        relationId: edge.relationId,
        entityId: edge.stintId,
        typeId: PROPERTIES[kind].card,
        spaceId: edge.spaceId,
        subtree: edge.subtree,
      });
    }
  }

  return orphans;
}

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

  const { data, isLoading, isError } = useQuery({
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

  /**
   * The saved edge for an organisation already on the profile.
   *
   * "Add another role here" supplies one, because it was clicked on a card. The
   * section's own button does not, so picking an employer that is already listed
   * would open a second Employment edge to it — the thing one-edge-per-employer
   * exists to prevent.
   */
  const savedStintFor = React.useCallback(
    (cards: HistoryCard<HistoryEntry>[], organizationId: string) =>
      cards.find(card => card.organization.id === organizationId)?.edges.find(edge => !isPending(edge.relationId))
        ?.stintId,
    []
  );

  const addPosition = React.useCallback(
    (draft: PositionDraft) => {
      const existingStintId = draft.existingStintId ?? savedStintFor(data?.employment ?? [], draft.company.id);
      setPending(current => ({
        ...current,
        positions: [...current.positions, { key: ID.createEntityId(), draft: { ...draft, existingStintId } }],
      }));
    },
    [data?.employment, savedStintFor]
  );

  const addEducation = React.useCallback(
    (draft: EducationDraft) => {
      const existingStintId = draft.existingStintId ?? savedStintFor(data?.education ?? [], draft.school.id);
      setPending(current => ({
        ...current,
        education: [...current.education, { key: ID.createEntityId(), draft: { ...draft, existingStintId } }],
      }));
    },
    [data?.education, savedStintFor]
  );

  /**
   * What removing one row costs.
   *
   * The row alone. Whether the organisation edge above it goes too is not
   * decided here — see `orphanedEdges`, which works it out from the pending
   * state as it finally stands.
   */
  const rowRemoval = React.useCallback(
    (entry: HistoryEntry, kind: Kind): PendingRemoval => ({
      relationId: entry.relationId,
      entityId: entry.tenureId,
      typeId: PROPERTIES[kind].entry,
      spaceId: entry.spaceId,
      subtree: entry.subtree,
    }),
    []
  );

  const removeEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: Kind) => {
      // Never written, so there is nothing to delete — just forget it.
      if (isPending(entry.relationId)) {
        setPending(current => dropPendingAddition(current, entry.relationId));
        return;
      }

      setPending(current => ({ ...current, removals: [...current.removals, rowRemoval(entry, kind)] }));
    },
    [rowRemoval]
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
      const organizationId = 'company' in draft ? draft.company.id : draft.school.id;
      const staysPut = organizationId === card.organization.id;

      // The edge a row hangs off belongs to the organisation it was under. Move
      // the row to a different employer and that edge is the wrong one — kept, it
      // would publish the Roles relation under the company the row just left.
      const reattached = { ...draft, existingStintId: staysPut ? draft.existingStintId : undefined };

      if (isPending(entry.relationId)) {
        setPending(current => replacePendingAddition(current, entry.relationId, reattached));
        return;
      }

      // The replacement attaches straight back to the edge when the employer is
      // unchanged. What hung off the row goes either way: the replacement writes
      // its own dates and skills, and the old ones are not merged into them.
      const next = { ...reattached, existingStintId: staysPut ? entry.edge.stintId : undefined };

      setPending(current => ({
        ...current,
        removals: [...current.removals, rowRemoval(entry, kind)],
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
    [rowRemoval]
  );

  /**
   * Everything pending, as rows for the modal's Save to publish with its own.
   *
   * Deletions are tombstones — rows carrying `isDeleted` — and a removal produces
   * one for the relation plus one for everything on the entity it carries. The
   * publish layer reads only the id off a tombstone, so these carry the minimum a
   * delete needs rather than the row as it stands in the graph.
   */
  const staged = React.useMemo((): StagedRows => {
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

    const removals = [
      ...pending.removals,
      ...orphanedEdges(data?.employment ?? [], 'employment', pending),
      ...orphanedEdges(data?.education ?? [], 'education', pending),
    ];

    const ours = (rowSpaceId: string | null) => rowSpaceId === null || rowSpaceId === spaceId;

    for (const removal of removals) {
      // A relation in another space is not ours to delete, and a tombstone for it
      // would be a delete op aimed at a space the row is not in — the edit would
      // report success and change nothing.
      if (!ours(removal.spaceId)) continue;

      removedRelations.push(tombstone(removal.relationId, removal.typeId, removal.entityId));

      // The type is not known per row here, and the publish layer does not read
      // one off a tombstone, so the removal's own stands in.
      for (const relation of removal.subtree.relations.filter(row => ours(row.spaceId))) {
        removedRelations.push(tombstone(relation.id, removal.typeId, removal.entityId));
      }

      for (const value of removal.subtree.values.filter(row => ours(row.spaceId))) {
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
  }, [data?.education, data?.employment, entityId, pending, spaceId]);

  /**
   * The rows this pending state publishes.
   *
   * Held rather than rebuilt per call: staging mints entity ids, so calling it
   * twice for one unchanged edit produced two different sets of rows — and the
   * publish layer reads that as a different edit, throwing away a staged upload
   * and doing it again.
   */
  const stagePending = React.useCallback(() => staged, [staged]);

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
    /**
     * The read failed, so what is on screen is not what is on the profile.
     * Adding against it would duplicate whatever the failure hid.
     */
    isUnavailable: isError,
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

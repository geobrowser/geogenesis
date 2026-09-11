'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';
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
} from '~/core/profile/pending-history';
import {
  type EducationDraft,
  type PositionDraft,
  type StagedRows,
  stageEducation,
  stagePosition,
} from '~/core/profile/stage-history';
import type { Relation } from '~/core/types';

type Params = { entityId: string; spaceId: string; enabled?: boolean };

/**
 * Work and education on the viewer's own profile (GEO-2858).
 *
 * Nothing here writes on its own. Adding a position, adding a degree and removing
 * either are collected, and the modal's Save publishes them alongside the four
 * header fields as a single edit — so correcting four things costs one ~10s wait
 * rather than four, and nothing lands until the user says so.
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

  const removeEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: 'employment' | 'education') => {
      // Never written, so there is nothing to delete — just forget it.
      if (isPending(entry.relationId)) {
        setPending(current => dropPendingAddition(current, entry.relationId));
        return;
      }

      const entryType = kind === 'employment' ? ROLES_PROPERTY : DEGREE_PROPERTY;
      const cardType = kind === 'employment' ? EMPLOYMENT_PROPERTY : EDUCATION_PROPERTY;

      // The last row takes its organisation with it: an organisation with nothing
      // under it is not a record of anything. Counted over saved rows only — a
      // sibling that is itself unwritten cannot keep the edge alive.
      const savedSiblings = card.entries.filter(
        other => other.relationId !== entry.relationId && !isPending(other.relationId)
      );

      const removals: PendingRemoval[] = [
        { relationId: entry.relationId, entityId: entry.tenureId, typeId: entryType },
      ];
      if (savedSiblings.length === 0 && !isPending(card.relationId)) {
        removals.push({ relationId: card.relationId, entityId: card.stintId, typeId: cardType });
      }

      setPending(current => ({ ...current, removals: [...current.removals, ...removals] }));
    },
    []
  );

  const removeCard = React.useCallback((card: HistoryCard<HistoryEntry>, kind: 'employment' | 'education') => {
    const entryType = kind === 'employment' ? ROLES_PROPERTY : DEGREE_PROPERTY;
    const cardType = kind === 'employment' ? EMPLOYMENT_PROPERTY : EDUCATION_PROPERTY;

    setPending(current => {
      let next = current;
      for (const entry of card.entries) {
        if (isPending(entry.relationId)) next = dropPendingAddition(next, entry.relationId);
      }

      if (isPending(card.relationId)) return next;

      return {
        ...next,
        removals: [
          ...next.removals,
          ...card.entries
            .filter(entry => !isPending(entry.relationId))
            .map(entry => ({ relationId: entry.relationId, entityId: entry.tenureId, typeId: entryType })),
          { relationId: card.relationId, entityId: card.stintId, typeId: cardType },
        ],
      };
    });
  }, []);

  /**
   * Everything pending, as rows for the modal's Save to publish with its own.
   *
   * Deletions are expressed as tombstoned relations. The reader returns cards
   * rather than store rows, so these carry the minimum a delete needs — the
   * publish layer reads only the id off a tombstone.
   */
  const stagePending = React.useCallback((): StagedRows => {
    const context = { personEntityId: entityId, spaceId };

    const additions = [
      ...pending.positions.map(addition => stagePosition(addition.draft, context)),
      ...pending.education.map(addition => stageEducation(addition.draft, context)),
    ];

    const tombstones: Relation[] = pending.removals.map(removal => ({
      id: removal.relationId,
      entityId: removal.entityId,
      spaceId,
      renderableType: 'RELATION',
      isDeleted: true,
      type: { id: removal.typeId, name: null },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: removal.entityId, name: null, value: removal.entityId },
    }));

    return {
      values: additions.flatMap(rows => rows.values),
      relations: [...additions.flatMap(rows => rows.relations), ...tombstones],
    };
  }, [entityId, pending, spaceId]);

  /** Called once the save lands, so the merged view falls back to the graph's. */
  const settle = React.useCallback(() => {
    setPending(NOTHING_PENDING);
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const discard = React.useCallback(() => setPending(NOTHING_PENDING), []);

  const employment = React.useMemo(
    () => mergePendingEmployment(data?.employment ?? [], pending.positions, pending.removals),
    [data?.employment, pending]
  );

  const education = React.useMemo(
    () => mergePendingEducation(data?.education ?? [], pending.education, pending.removals),
    [data?.education, pending]
  );

  return {
    employment: employment as EmploymentCard[],
    education: education as EducationCard[],
    isLoading,
    hasPendingChanges: hasPendingChanges(pending),
    addPosition,
    addEducation,
    removeEntry,
    removeCard,
    stagePending,
    settle,
    discard,
  };
}

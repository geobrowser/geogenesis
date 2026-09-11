'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePublish } from '~/core/hooks/use-publish';
import { fetchProfileHistory, profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import {
  DEGREE_PROPERTY,
  EDUCATION_PROPERTY,
  EMPLOYMENT_PROPERTY,
  ROLES_PROPERTY,
} from '~/core/profile/history-ontology';
import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';
import {
  type EducationDraft,
  type PositionDraft,
  type StagedRows,
  stageEducation,
  stagePosition,
} from '~/core/profile/stage-history';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import type { Relation } from '~/core/types';

export type HistoryStatus = 'idle' | 'saving' | 'error';

type Params = { entityId: string; spaceId: string; enabled?: boolean };

/**
 * Work and education on the viewer's own profile (GEO-2858).
 *
 * Kept apart from `useEditProfile` on purpose. The four header fields are one
 * draft the user edits and saves together; a position is a separate unit of
 * work, published the moment it is written, and mixing them would mean a
 * half-written job blocking a name change.
 */
export function useProfileHistory({ entityId, spaceId, enabled = true }: Params) {
  const { storage } = useMutate();
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();

  const [status, setStatus] = React.useState<HistoryStatus>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const queryKey = profileHistoryQueryKey(entityId);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: enabled && entityId !== '',
    queryFn: () => fetchProfileHistory(entityId),
    staleTime: 60_000,
  });

  /**
   * Writes the rows locally, publishes exactly those, and takes them back out
   * again if the write fails.
   *
   * Collected back out of the store rather than published as constructed: the
   * store stamps `isLocal` on what it accepts, and the publish layer drops any
   * value without it — so the rows handed over have to be the stored ones.
   */
  const publishRows = React.useCallback(
    async (rows: StagedRows, editName: string) => {
      setStatus('saving');
      setErrorMessage(null);

      rows.values.forEach(value => storage.values.set(value));
      rows.relations.forEach(relation => storage.relations.set(relation));

      const valueIds = new Set(rows.values.map(value => value.id));
      const relationIds = new Set(rows.relations.map(relation => relation.id));

      const values = getValues({ includeDeleted: true, selector: value => valueIds.has(value.id) });
      const relations = getRelations({ includeDeleted: true, selector: relation => relationIds.has(relation.id) });

      let failed = false;

      await makeProposal({
        values,
        relations,
        spaceId,
        name: editName,
        onSuccess: () => {
          setStatus('idle');
          void queryClient.invalidateQueries({ queryKey });
        },
        onError: () => {
          failed = true;
        },
      });

      if (!failed) return;

      // All or nothing. A stint with no role under it renders as a company you
      // are somehow attached to with nothing to say about it, which is worse
      // than no entry at all — so a failed write leaves nothing behind.
      store.clearLocalChangesByIds({
        spaceId,
        valueIds: [...valueIds],
        relationIds: [...relationIds],
      });

      setStatus('error');
      setErrorMessage('Couldn’t save that. Nothing was published — please try again.');
    },
    [makeProposal, queryClient, queryKey, spaceId, storage]
  );

  const addPosition = React.useCallback(
    (draft: PositionDraft) => publishRows(stagePosition(draft, { personEntityId: entityId, spaceId }), 'Add position'),
    [entityId, publishRows, spaceId]
  );

  const addEducation = React.useCallback(
    (draft: EducationDraft) =>
      publishRows(stageEducation(draft, { personEntityId: entityId, spaceId }), 'Add education'),
    [entityId, publishRows, spaceId]
  );

  /**
   * Deletes by id. The reader returns cards rather than store rows, so these are
   * the minimum a delete needs — the publish layer only reads `id` off a
   * tombstoned relation, and the store only needs enough to mark one.
   */
  const removeRelations = React.useCallback(
    async (targets: { relationId: string; entityId: string; typeId: string }[], editName: string) => {
      setStatus('saving');
      setErrorMessage(null);

      const tombstones: Relation[] = targets.map(target => ({
        id: target.relationId,
        entityId: target.entityId,
        spaceId,
        renderableType: 'RELATION',
        type: { id: target.typeId, name: null },
        fromEntity: { id: entityId, name: null },
        toEntity: { id: target.entityId, name: null, value: target.entityId },
      }));

      tombstones.forEach(relation => storage.relations.delete(relation));

      const ids = new Set(tombstones.map(relation => relation.id));
      const relations = getRelations({ includeDeleted: true, selector: relation => ids.has(relation.id) });

      let failed = false;

      await makeProposal({
        values: [],
        relations,
        spaceId,
        name: editName,
        onSuccess: () => {
          setStatus('idle');
          void queryClient.invalidateQueries({ queryKey });
        },
        onError: () => {
          failed = true;
        },
      });

      if (!failed) return;

      store.clearLocalChangesByIds({ spaceId, valueIds: [], relationIds: [...ids] });
      setStatus('error');
      setErrorMessage('Couldn’t remove that. Nothing was published — please try again.');
    },
    [entityId, makeProposal, queryClient, queryKey, spaceId, storage]
  );

  /**
   * Removing the last row takes its organisation with it, for the same reason a
   * position is written all at once: an organisation with nothing under it is
   * not a record of anything.
   */
  const removeEntry = React.useCallback(
    (card: HistoryCard<HistoryEntry>, entry: HistoryEntry, kind: 'employment' | 'education') => {
      const entryType = kind === 'employment' ? ROLES_PROPERTY : DEGREE_PROPERTY;
      const cardType = kind === 'employment' ? EMPLOYMENT_PROPERTY : EDUCATION_PROPERTY;

      const targets = [{ relationId: entry.relationId, entityId: entry.tenureId, typeId: entryType }];
      if (card.entries.length <= 1) {
        targets.push({ relationId: card.relationId, entityId: card.stintId, typeId: cardType });
      }

      return removeRelations(targets, kind === 'employment' ? 'Remove position' : 'Remove education');
    },
    [removeRelations]
  );

  const removeCard = React.useCallback(
    (card: HistoryCard<HistoryEntry>, kind: 'employment' | 'education') => {
      const entryType = kind === 'employment' ? ROLES_PROPERTY : DEGREE_PROPERTY;
      const cardType = kind === 'employment' ? EMPLOYMENT_PROPERTY : EDUCATION_PROPERTY;

      return removeRelations(
        [
          ...card.entries.map(entry => ({
            relationId: entry.relationId,
            entityId: entry.tenureId,
            typeId: entryType,
          })),
          { relationId: card.relationId, entityId: card.stintId, typeId: cardType },
        ],
        kind === 'employment' ? 'Remove employer' : 'Remove school'
      );
    },
    [removeRelations]
  );

  return {
    employment: (data?.employment ?? []) as EmploymentCard[],
    education: (data?.education ?? []) as EducationCard[],
    isLoading,
    status,
    errorMessage,
    addPosition,
    addEducation,
    removeEntry,
    removeCard,
    dismissError: React.useCallback(() => {
      setStatus('idle');
      setErrorMessage(null);
    }, []),
  };
}

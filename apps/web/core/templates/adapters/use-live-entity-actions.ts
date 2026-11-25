'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';
import { E } from '~/core/sync/orm';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { Entity } from '~/core/types';

import type { EntityActionCallbacks } from '../models';
import { CANONICAL_PREDICATE_PROPERTY_IDS, TEMPLATE_ONTOLOGY } from '../ontology';
import {
  type ClaimDraft,
  type EventDraft,
  type QuoteDraft,
  type TemplateOwnerKind,
  makeLocalRelation,
} from './template-add-edits';
import { useTemplateAddPublish } from './use-template-add-publish';

/**
 * `EntityActionCallbacks` for live templates. Add claim / event / quote publish on submit
 * (`useTemplateAddPublish`); Add context, Dispute and relation deletes only stage local edits.
 */
export function useLiveEntityActions({
  entityId,
  entityName,
  spaceId,
  entity,
  ownerKind,
}: {
  entityId: string;
  entityName: string;
  spaceId: string;
  entity: Entity | null | undefined;
  ownerKind: TemplateOwnerKind;
}): EntityActionCallbacks {
  const { storage } = useMutate();
  const { store } = useSyncEngine();
  const queryClient = useQueryClient();

  // Cache entity IDs returned by live search so choosing a search suggestion links to the real
  // existing entity instead of minting a duplicate entity with the same name.
  const searchCacheRef = React.useRef<Map<string, { id: string; name: string }>>(new Map());

  const searchEntities = React.useCallback(
    async (rawQuery: string): Promise<readonly { id: string; name: string }[]> => {
      const q = rawQuery.trim();
      if (q.length < 2) return [];
      try {
        const page = await E.findFuzzyPage({
          store,
          cache: queryClient,
          where: { name: { fuzzy: q } },
          first: 6,
          skip: 0,
        });
        const hits: { id: string; name: string }[] = [];
        for (const item of page.results) {
          const name = item.name?.trim();
          if (!name) continue;
          const entry = { id: item.id, name };
          searchCacheRef.current.set(name.toLowerCase(), entry);
          hits.push(entry);
        }
        return hits;
      } catch {
        return [];
      }
    },
    [queryClient, store]
  );

  const resolvePredicateProperty = React.useCallback(
    (predicateLabel: string): { id: string; name: string } => {
      const normalized = predicateLabel.trim().toLowerCase();

      // 1. Reuse an existing relation property already present on this entity.
      const existingRel = entity?.relations.find(
        rel => !rel.isDeleted && rel.type.name?.trim().toLowerCase() === normalized
      );
      if (existingRel?.type.id) {
        return { id: existingRel.type.id, name: existingRel.type.name ?? predicateLabel.trim() };
      }

      // 2. Match a canonical Geo schema property.
      const canonical = CANONICAL_PREDICATE_PROPERTY_IDS[normalized];
      if (canonical) return canonical;

      // 3. Create a real RELATION property in the current space.
      const propertyId = ID.createEntityId();
      const name = predicateLabel.trim();
      storage.properties.create({
        entityId: propertyId,
        spaceId,
        name,
        dataType: 'RELATION',
        renderableTypeId: null,
      });
      return { id: propertyId, name };
    },
    [entity?.relations, spaceId, storage.properties]
  );

  const onAddTriple = React.useCallback(
    (targetId: string, predicate: string, labels: readonly string[]) => {
      const prop = resolvePredicateProperty(predicate);
      const fromName = targetId === entityId ? entityName : null;

      for (const rawLabel of labels) {
        const label = rawLabel.trim();
        if (!label) continue;

        const cached = searchCacheRef.current.get(label.toLowerCase());
        const toId = cached?.id ?? ID.createEntityId();
        const toName = cached?.name ?? label;

        if (!cached) {
          storage.entities.name.set(toId, spaceId, toName);
        }

        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: prop.id,
            typeName: prop.name,
            fromId: targetId,
            fromName,
            toId,
            toName,
          })
        );
      }
    },
    [entityId, entityName, resolvePredicateProperty, spaceId, storage.entities.name, storage.relations]
  );

  const onDeleteTriple = React.useCallback(
    (_targetId: string, valueId: string) => {
      const match = entity?.relations.find(rel => !rel.isDeleted && rel.id === valueId);
      if (match) {
        storage.relations.delete(match);
      }
    },
    [entity?.relations, storage.relations]
  );

  const onAddFlag = React.useCallback(
    (targetId: string, draft: { reason: string; body: string; sourceUrl?: string }) => {
      const noteId = ID.createEntityId();
      const title = draft.body.trim();
      if (!title) return;

      storage.entities.name.set(noteId, spaceId, title);
      if (draft.reason.trim()) {
        storage.values.set({
          entity: { id: noteId, name: title },
          property: {
            id: SystemIds.DESCRIPTION_PROPERTY,
            name: 'Description',
            dataType: 'TEXT',
          },
          spaceId,
          value: draft.reason.trim(),
        });
      }
      if (draft.sourceUrl?.trim()) {
        storage.values.set({
          entity: { id: noteId, name: title },
          property: {
            id: TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID,
            name: 'Web URL',
            dataType: 'TEXT',
          },
          spaceId,
          value: draft.sourceUrl.trim(),
        });
      }
      storage.relations.set(
        makeLocalRelation({
          spaceId,
          typeId: SystemIds.TYPES_PROPERTY,
          typeName: 'Types',
          fromId: noteId,
          fromName: title,
          toId: TEMPLATE_ONTOLOGY.COMMUNITY_NOTE_TYPE_ID,
          toName: 'Community note',
        })
      );
      storage.relations.set(
        makeLocalRelation({
          spaceId,
          typeId: TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID,
          typeName: 'Community notes',
          fromId: targetId,
          fromName: targetId === entityId ? entityName : null,
          toId: noteId,
          toName: title,
        })
      );
    },
    [entityId, entityName, spaceId, storage.entities.name, storage.relations, storage.values]
  );

  const owner = React.useMemo(
    () => ({ entityId, entityName, ownerKind, spaceId }),
    [entityId, entityName, ownerKind, spaceId]
  );
  const { add, holdAddDraft } = useTemplateAddPublish({ owner, pageSpaceId: spaceId });
  const onAddClaim = React.useCallback((draft: ClaimDraft) => add({ kind: 'claim', draft }), [add]);
  const onAddEvent = React.useCallback((draft: EventDraft) => add({ kind: 'event', draft }), [add]);
  const onAddQuote = React.useCallback((draft: QuoteDraft) => add({ kind: 'quote', draft }), [add]);

  return React.useMemo<EntityActionCallbacks>(
    () => ({
      onAddTriple,
      onDeleteTriple,
      onAddFlag,
      onAddClaim,
      onAddQuote,
      onAddEvent,
      holdAddDraft,
      searchEntities,
    }),
    [holdAddDraft, onAddClaim, onAddEvent, onAddFlag, onAddQuote, onAddTriple, onDeleteTriple, searchEntities]
  );
}

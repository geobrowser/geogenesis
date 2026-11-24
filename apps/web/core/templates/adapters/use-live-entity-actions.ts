'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';
import { E } from '~/core/sync/orm';
import { useMutate } from '~/core/sync/use-mutate';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { Entity, Relation } from '~/core/types';

import type { EntityActionCallbacks } from '../models';
import { CANONICAL_PREDICATE_PROPERTY_IDS, TEMPLATE_ONTOLOGY } from '../ontology';

function makeLocalRelation({
  spaceId,
  typeId,
  typeName,
  fromId,
  fromName,
  toId,
  toName,
}: {
  spaceId: string;
  typeId: string;
  typeName: string;
  fromId: string;
  fromName: string | null;
  toId: string;
  toName: string | null;
}): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    isLocal: true,
    hasBeenPublished: false,
    isDeleted: false,
    type: {
      id: typeId,
      name: typeName,
    },
    fromEntity: {
      id: fromId,
      name: fromName,
    },
    toEntity: {
      id: toId,
      name: toName,
      value: toId,
    },
  };
}

/**
 * Wires live Geo GRC-20 store mutations (`useMutate`) and fuzzy entity search (`E.findFuzzyPage`)
 * into `EntityActionCallbacks` so every inline `+` popover and relation delete in v2 templates
 * writes real local ops ready to publish in Geo Genesis.
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
  ownerKind: 'topic' | 'claim' | 'source' | 'event' | 'news-story' | 'post' | 'podcast' | 'episode';
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

  const onAddClaim = React.useCallback(
    (draft: {
      title: string;
      kind: 'fact' | 'judgment' | 'value-judgment';
      stance?: 'supports' | 'opposes' | 'addresses';
      note?: string;
    }) => {
      const title = draft.title.trim();
      if (!title) return;

      const claimId = ID.createEntityId();
      storage.entities.name.set(claimId, spaceId, title);
      storage.relations.set(
        makeLocalRelation({
          spaceId,
          typeId: SystemIds.TYPES_PROPERTY,
          typeName: 'Types',
          fromId: claimId,
          fromName: title,
          toId: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID,
          toName: 'Claim',
        })
      );
      storage.values.set({
        entity: { id: claimId, name: title },
        property: {
          id: TEMPLATE_ONTOLOGY.CLAIM_IS_FACTUAL_PROPERTY_ID,
          name: 'Is factual',
          dataType: 'BOOLEAN',
        },
        spaceId,
        value: draft.kind === 'fact' ? '1' : '0',
      });
      if (draft.note?.trim()) {
        storage.values.set({
          entity: { id: claimId, name: title },
          property: {
            id: SystemIds.DESCRIPTION_PROPERTY,
            name: 'Description',
            dataType: 'TEXT',
          },
          spaceId,
          value: draft.note.trim(),
        });
      }

      if (ownerKind === 'topic') {
        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
            typeName: 'Topics',
            fromId: claimId,
            fromName: title,
            toId: entityId,
            toName: entityName,
          })
        );
      } else if (ownerKind === 'claim') {
        if (draft.stance === 'supports') {
          storage.relations.set(
            makeLocalRelation({
              spaceId,
              typeId: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID,
              typeName: 'Supports',
              fromId: claimId,
              fromName: title,
              toId: entityId,
              toName: entityName,
            })
          );
        } else if (draft.stance === 'opposes') {
          storage.relations.set(
            makeLocalRelation({
              spaceId,
              typeId: TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID,
              typeName: 'Opposes',
              fromId: claimId,
              fromName: title,
              toId: entityId,
              toName: entityName,
            })
          );
        } else {
          storage.relations.set(
            makeLocalRelation({
              spaceId,
              typeId: TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
              typeName: 'Subclaims',
              fromId: entityId,
              fromName: entityName,
              toId: claimId,
              toName: title,
            })
          );
        }
      } else if (ownerKind === 'source') {
        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
            typeName: 'Sources',
            fromId: claimId,
            fromName: title,
            toId: entityId,
            toName: entityName,
          })
        );
      } else if (ownerKind === 'episode') {
        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
            typeName: 'Notable claims',
            fromId: entityId,
            fromName: entityName,
            toId: claimId,
            toName: title,
          })
        );
      } else {
        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
            typeName: 'Related claims',
            fromId: entityId,
            fromName: entityName,
            toId: claimId,
            toName: title,
          })
        );
      }
    },
    [entityId, entityName, ownerKind, spaceId, storage.entities.name, storage.relations, storage.values]
  );

  const onAddQuote = React.useCallback(
    (draft: { text: string; speaker?: string; location?: string }) => {
      const text = draft.text.trim();
      if (!text) return;

      const quoteId = ID.createEntityId();
      storage.entities.name.set(quoteId, spaceId, text);
      storage.relations.set(
        makeLocalRelation({
          spaceId,
          typeId: SystemIds.TYPES_PROPERTY,
          typeName: 'Types',
          fromId: quoteId,
          fromName: text,
          toId: TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID,
          toName: 'Quote',
        })
      );
      const attribution = [draft.speaker?.trim(), draft.location?.trim()].filter(Boolean).join(', ');
      if (attribution) {
        storage.values.set({
          entity: { id: quoteId, name: text },
          property: {
            id: SystemIds.DESCRIPTION_PROPERTY,
            name: 'Description',
            dataType: 'TEXT',
          },
          spaceId,
          value: attribution,
        });
      }
      if (ownerKind === 'episode') {
        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID,
            typeName: 'Quotes',
            fromId: entityId,
            fromName: entityName,
            toId: quoteId,
            toName: text,
          })
        );
      } else {
        storage.relations.set(
          makeLocalRelation({
            spaceId,
            typeId: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
            typeName: 'Sources',
            fromId: quoteId,
            fromName: text,
            toId: entityId,
            toName: entityName,
          })
        );
      }
    },
    [entityId, entityName, ownerKind, spaceId, storage.entities.name, storage.relations, storage.values]
  );

  const onAddEvent = React.useCallback(
    (draft: { title: string; when?: string; summary?: string }) => {
      const title = draft.title.trim();
      if (!title) return;

      const eventId = ID.createEntityId();
      storage.entities.name.set(eventId, spaceId, title);
      storage.relations.set(
        makeLocalRelation({
          spaceId,
          typeId: SystemIds.TYPES_PROPERTY,
          typeName: 'Types',
          fromId: eventId,
          fromName: title,
          toId: TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID,
          toName: 'News event',
        })
      );
      if (draft.summary?.trim()) {
        storage.values.set({
          entity: { id: eventId, name: title },
          property: {
            id: SystemIds.DESCRIPTION_PROPERTY,
            name: 'Description',
            dataType: 'TEXT',
          },
          spaceId,
          value: draft.summary.trim(),
        });
      }
      if (draft.when?.trim()) {
        storage.values.set({
          entity: { id: eventId, name: title },
          property: {
            id: TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID,
            name: 'Event date',
            dataType: 'DATE',
          },
          spaceId,
          value: draft.when.trim(),
        });
      }
      storage.relations.set(
        makeLocalRelation({
          spaceId,
          typeId: TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
          typeName: 'Topics',
          fromId: eventId,
          fromName: title,
          toId: entityId,
          toName: entityName,
        })
      );
    },
    [entityId, entityName, spaceId, storage.entities.name, storage.relations, storage.values]
  );

  return React.useMemo<EntityActionCallbacks>(
    () => ({
      onAddTriple,
      onDeleteTriple,
      onAddFlag,
      onAddClaim,
      onAddQuote,
      onAddEvent,
      searchEntities,
    }),
    [onAddClaim, onAddEvent, onAddFlag, onAddQuote, onAddTriple, onDeleteTriple, searchEntities]
  );
}

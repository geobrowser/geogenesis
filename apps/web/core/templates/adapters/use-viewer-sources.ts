'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { useQueryEntity, useRelations } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { COVERAGE_TYPE_IDS } from '~/core/topics/ontology';
import type { Entity, Relation } from '~/core/types';

import { TEMPLATE_ONTOLOGY } from '../ontology';

/**
 * A signed-in non-member's Sources "+" import lands in their own personal space (GEO-3819), but a
 * page's Sources section reads the page's space only — so the person who added a source never saw
 * it. These hooks add the *viewer's own* personal-space links to those sections, and nobody else's:
 * other viewers still see only the page's space.
 */

/** The signed-in viewer's personal space, or null when signed out, unregistered, or it is the page's space. */
export function useViewerSpaceId(pageSpaceId: string): string | null {
  const { personalSpaceId } = usePersonalSpaceId();
  if (!personalSpaceId || ID.equals(personalSpaceId, pageSpaceId)) return null;
  return personalSpaceId;
}

/**
 * The links a viewer adds from a page into their personal space: Sources (GEO-3819), and the claims
 * and quotes Add claim / Add quote link from the page (GEO-3836).
 */
const VIEWER_LINK_PROPERTY_IDS = [
  TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
  TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
  TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
  TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
  TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID,
];

/**
 * The page entity with the viewer's personal-space links (`VIEWER_LINK_PROPERTY_IDS`) appended after
 * its own. Only those properties are taken from the viewer's space, and they go last, so the readers
 * that dedupe by target (`readEntityRelations`, `getClaimSources`) keep the page's own link when both
 * spaces have one.
 */
export function withViewerSources(entity: Entity | null, viewerEntity: Entity | null): Entity | null {
  if (!entity || !viewerEntity) return entity;
  const extra = viewerEntity.relations.filter(
    relation =>
      relation.isDeleted !== true &&
      VIEWER_LINK_PROPERTY_IDS.some(propertyId => ID.equals(relation.type.id, propertyId))
  );
  if (extra.length === 0) return entity;
  return { ...entity, relations: [...entity.relations, ...extra] };
}

/**
 * For News story / Claim / Event / Post Sources, and the claim and quote lists Add claim / Add quote
 * link from the page (News story, Post, Episode, Claim sub-claims). The second read is the same entity scoped to the
 * viewer's space: hydration is keyed by entity id alone, so it shares the page's request and costs
 * no extra fetch. Signed out (no personal space) it is disabled outright.
 */
export function useEntityWithViewerSources({
  entity,
  entityId,
  spaceId,
}: {
  entity: Entity | null;
  entityId: string;
  spaceId: string;
}): Entity | null {
  const viewerSpaceId = useViewerSpaceId(spaceId);
  const { entity: viewerEntity } = useQueryEntity({
    id: entityId,
    spaceId: viewerSpaceId ?? undefined,
    enabled: viewerSpaceId !== null,
  });
  return React.useMemo(
    () => withViewerSources(entity, viewerSpaceId ? viewerEntity : null),
    [entity, viewerEntity, viewerSpaceId]
  );
}

export type ViewerTopicSource = {
  id: string;
  name: string | null;
  typeIds: string[];
  typeName: string | null;
  spaceId: string;
};

/**
 * The viewer's `source --Topics--> topic` links held in the local store for their personal space —
 * staged ones included, which the Topic's GraphQL coverage can't see until publish and index. Kept to
 * the coverage kinds, so a claim the viewer tagged doesn't turn up as a source.
 */
export function viewerTopicSources(
  relations: readonly Relation[],
  topicId: string,
  viewerSpaceId: string | null,
  getEntity: (id: string) => Pick<Entity, 'name' | 'types'> | undefined
): ViewerTopicSource[] {
  if (!viewerSpaceId) return [];
  const seen = new Set<string>();
  const out: ViewerTopicSource[] = [];
  for (const relation of relations) {
    if (relation.isDeleted === true) continue;
    if (!ID.equals(relation.spaceId, viewerSpaceId)) continue;
    if (!ID.equals(relation.type.id, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID)) continue;
    if (!ID.equals(relation.toEntity.id, topicId)) continue;
    const hex = ID.uuidToHex(relation.fromEntity.id);
    if (seen.has(hex)) continue;
    const source = getEntity(relation.fromEntity.id);
    const typeIds = source?.types.map(type => type.id) ?? [];
    if (!typeIds.some(typeId => COVERAGE_TYPE_IDS.some(coverageId => ID.equals(coverageId, typeId)))) continue;
    seen.add(hex);
    out.push({
      id: relation.fromEntity.id,
      name: source?.name ?? relation.fromEntity.name ?? null,
      typeIds,
      typeName: source?.types.find(type => type.name)?.name ?? null,
      spaceId: viewerSpaceId,
    });
  }
  return out;
}

const NO_RELATIONS: Relation[] = [];

export function useViewerTopicSources(topicId: string, viewerSpaceId: string | null): ViewerTopicSource[] {
  const { store } = useSyncEngine();
  const matched = useRelations({
    selector: relation =>
      viewerSpaceId !== null &&
      ID.equals(relation.spaceId, viewerSpaceId) &&
      ID.equals(relation.type.id, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID) &&
      ID.equals(relation.toEntity.id, topicId),
  });
  const relations = viewerSpaceId ? matched : NO_RELATIONS;
  return React.useMemo(
    () => viewerTopicSources(relations, topicId, viewerSpaceId, id => store.getEntity(id)),
    [relations, store, topicId, viewerSpaceId]
  );
}

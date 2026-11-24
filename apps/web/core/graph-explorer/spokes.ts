import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';
import { entityHomeSpaceId } from '~/core/utils/space/entity-home-space';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import type { GraphEntity, GraphHop, GraphRelation } from './graph-entity';
import type { GraphFilter } from './graph-filter';
import { CONTENT_RELATION_LABELS } from './graph-kinds';
import { RELATION_LABELS } from './ontology';

/** Graph nodes drawn around the centre; the rest are in the Relationships tab. */
export const SPOKE_CAP_DESKTOP = 8;
export const SPOKE_CAP_PHONE = 6;

export type Spoke = {
  entity: GraphEntity;
  /** Every distinct label a relation to this neighbour reads as, outgoing first. */
  labels: string[];
  /** The spaces the relations putting it here were written in. */
  edgeSpaceIds: string[];
  /** Where the neighbour's own data is read from when it becomes the centre. */
  nodeSpaceId: string | null;
  hasOutgoing: boolean;
};

export function relationLabel(relation: Pick<GraphRelation, 'propertyId' | 'propertyName' | 'direction'>): string {
  const id = normId(relation.propertyId);
  const known = RELATION_LABELS[id] ?? CONTENT_RELATION_LABELS[id];
  if (known) return known[relation.direction];
  const name = relation.propertyName?.trim() || 'Relation';
  return relation.direction === 'out' ? name : `${name} (incoming)`;
}

/**
 * The space to read an entity in: `preferredSpaceId` (the route or topic space) when it is named
 * there, as the topic page does; else where it is named inside the filter, ranked; else
 * `entityHomeSpaceId` (named anywhere, then ranked); else `fallbackSpaceId`. A space that only cites
 * it never wins.
 */
export function entitySpaceId(
  entity: { spaceIds: readonly string[]; namedSpaceIds: readonly string[] },
  allowedSpaceIds: readonly string[] | undefined,
  fallbackSpaceId: string | null,
  preferredSpaceId: string | null = null
): string | null {
  const named = entity.namedSpaceIds.map(normId);
  if (preferredSpaceId && named.includes(normId(preferredSpaceId))) return normId(preferredSpaceId);
  if (allowedSpaceIds) {
    const allowed = new Set(allowedSpaceIds.map(normId));
    const inScope = getTopRankedSpaceId(named.filter(id => allowed.has(id)));
    if (inScope) return inScope;
  }
  const home = entityHomeSpaceId({
    spaces: entity.spaceIds.map(normId),
    values: named.map(spaceId => ({ property: { id: SystemIds.NAME_PROPERTY }, spaceId, value: 'named' })),
  });
  return home ?? fallbackSpaceId;
}

/** Spaces holding a live, non-empty name among an entity's store values. */
export function namedSpaceIds(
  values: ReadonlyArray<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: unknown }>
): string[] {
  const named = values.filter(
    value =>
      value.isDeleted !== true &&
      normId(value.property.id) === normId(SystemIds.NAME_PROPERTY) &&
      typeof value.value === 'string' &&
      value.value.trim().length > 0
  );
  return [...new Set(named.map(value => normId(value.spaceId)))];
}

/**
 * One spoke per named neighbour, merging relations to the same neighbour. Order: outgoing first,
 * then curator `position`, then name.
 */
export function buildSpokes(
  hop: GraphHop,
  centreId: string,
  filter: Pick<GraphFilter, 'spaceIds'>,
  topicSpaceId: string | null = null
): Spoke[] {
  const centre = normId(centreId);
  const byId = new Map<string, Spoke & { order: string }>();

  for (const relation of hop.relations) {
    const entity = relation.entity;
    if (entity.id === centre || !entity.name) continue;

    const label = relationLabel(relation);
    const existing = byId.get(entity.id);
    if (existing) {
      if (!existing.labels.includes(label)) {
        existing.labels = relation.direction === 'out' ? [label, ...existing.labels] : [...existing.labels, label];
      }
      if (!existing.edgeSpaceIds.includes(relation.spaceId)) existing.edgeSpaceIds.push(relation.spaceId);
      if (relation.direction === 'out') {
        existing.hasOutgoing = true;
        if (relation.position && (!existing.order || relation.position < existing.order))
          existing.order = relation.position;
      }
      continue;
    }

    byId.set(entity.id, {
      entity,
      labels: [label],
      edgeSpaceIds: [relation.spaceId],
      nodeSpaceId: null,
      hasOutgoing: relation.direction === 'out',
      order: relation.direction === 'out' ? (relation.position ?? '') : '',
    });
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (a.hasOutgoing !== b.hasOutgoing) return a.hasOutgoing ? -1 : 1;
      if (a.order !== b.order) {
        if (!a.order) return 1;
        if (!b.order) return -1;
        return a.order < b.order ? -1 : 1;
      }
      return (a.entity.name ?? '').localeCompare(b.entity.name ?? '');
    })
    .map(({ order: _order, ...spoke }) => ({
      ...spoke,
      nodeSpaceId: entitySpaceId(spoke.entity, filter.spaceIds, spoke.edgeSpaceIds[0] ?? null, topicSpaceId),
    }));
}

/** Labels grouped for the Relationships tab, in first-seen order. */
export function groupSpokesByLabel(spokes: readonly Spoke[]): Array<{ label: string; spokes: Spoke[] }> {
  const groups = new Map<string, Spoke[]>();
  for (const spoke of spokes) {
    for (const label of spoke.labels) {
      const list = groups.get(label) ?? [];
      list.push(spoke);
      groups.set(label, list);
    }
  }
  return [...groups.entries()].map(([label, list]) => ({ label, spokes: list }));
}

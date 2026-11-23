import { normId } from '~/core/utils/norm-id';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import type { GraphEntity, GraphHop, GraphRelation } from './fetch-graph-hop';
import { type GraphFilter, keepNeighbour } from './graph-filter';
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
  const known = RELATION_LABELS[normId(relation.propertyId)];
  if (known) return known[relation.direction];
  const name = relation.propertyName?.trim() || 'Relation';
  return relation.direction === 'out' ? name : `${name} (incoming)`;
}

/**
 * The space an entity's data is read from: its top-ranked space inside the filter, else its
 * top-ranked space at all, else the space the relation came from. Never a fixed space.
 */
export function pickEntitySpaceId(
  entitySpaceIds: readonly string[],
  allowedSpaceIds: readonly string[] | undefined,
  fallbackSpaceId: string | null
): string | null {
  const own = entitySpaceIds.map(normId);
  if (allowedSpaceIds) {
    const allowed = new Set(allowedSpaceIds.map(normId));
    const inScope = own.filter(id => allowed.has(id));
    if (inScope.length > 0) return getTopRankedSpaceId(inScope);
  }
  return getTopRankedSpaceId(own) ?? fallbackSpaceId;
}

/**
 * One spoke per named neighbour the filter keeps, merging relations to the same neighbour.
 * Order: outgoing first, then curator `position`, then name.
 */
export function buildSpokes(hop: GraphHop, centreId: string, filter: GraphFilter): Spoke[] {
  const centre = normId(centreId);
  const byId = new Map<string, Spoke & { order: string }>();

  for (const relation of hop.relations) {
    const entity = relation.entity;
    if (entity.id === centre || !entity.name) continue;
    if (
      !keepNeighbour(
        entity.types.map(type => type.id),
        filter
      )
    )
      continue;

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
      nodeSpaceId: pickEntitySpaceId(spoke.entity.spaceIds, filter.spaceIds, spoke.edgeSpaceIds[0] ?? null),
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

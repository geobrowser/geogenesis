'use client';

import * as React from 'react';

import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import { limitTopicFeedSpaceIds } from '~/core/topics/browse/topic-feed-params';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';
import type { Entity, Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

/**
 * The spaces a template page lists content from: the canonical spaces, not only the space in the URL.
 *
 * "Canonical" is the scope the Topic pages used before the templates (`useTopicSpaceScope`): the
 * Featured spaces, the viewer's own member, editor and personal spaces, and the route's space. A
 * claim tagged with a topic only in US Politics therefore shows on that topic's page in World
 * Affairs too.
 *
 * Route space first, then the rest sorted, capped the way the Topic feed caps it, so the list keeps
 * one query key while the underlying lists reorder. While the scope is still resolving (or if it
 * never resolves) it is the route space alone: lists start with what they showed before and only
 * grow, never flash content that is then taken away.
 */
export function useTemplateSpaceScope(spaceId: string): { spaceIds: string[]; isResolving: boolean } {
  const scope = useTopicSpaceScope(spaceId);
  return React.useMemo(() => {
    const route = normId(spaceId);
    if (!scope) return { spaceIds: [route], isResolving: true };
    const rest = scope.map(normId).filter(id => id !== route);
    const ordered = limitTopicFeedSpaceIds([route, ...[...new Set(rest)].sort()], route) ?? [route];
    return { spaceIds: ordered.map(normId), isResolving: false };
  }, [scope, spaceId]);
}

/** `where` clause narrowing an entity query to entities living in any of `spaceIds`. */
export function spacesWhere(spaceIds: readonly string[]) {
  return spaceIds.map(id => ({ equals: normId(id) }));
}

/**
 * The page entity with the relations it holds in the other scope spaces appended after its own.
 *
 * The page entity is read in the route space, so its own lists (Sources, Subtopics, Supporting
 * claims, Quotes, Topics, Related people, ...) used to hold only what that space published. Readers
 * dedupe by target (`readEntityRelations`), so appending keeps the route space's link when two spaces
 * have one; the rest follow in space-rank order so the best-ranked space's link wins next.
 *
 * Only relations from `spaceIds` are added: another person's personal space, or any space outside
 * the scope, never reaches the page.
 */
export function withScopeRelations(
  entity: Entity | null,
  allSpacesEntity: Pick<Entity, 'relations'> | null,
  spaceIds: readonly string[],
  pageSpaceId: string
): Entity | null {
  if (!entity || !allSpacesEntity) return entity;
  const scope = new Set(spaceIds.map(normId));
  const page = normId(pageSpaceId);
  const own = new Set(entity.relations.map(relation => relation.id));
  const extra: Relation[] = allSpacesEntity.relations.filter(relation => {
    if (relation.isDeleted === true || own.has(relation.id)) return false;
    const space = normId(relation.spaceId);
    return space !== page && scope.has(space);
  });
  if (extra.length === 0) return entity;
  // Stable: same-rank spaces keep the store's order.
  extra.sort((a, b) => getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId));
  return { ...entity, relations: [...entity.relations, ...extra] };
}

/**
 * `withScopeRelations` for a page entity. The second read is the same entity unscoped: hydration is
 * keyed by entity id alone, so it shares the page's request and costs no extra fetch.
 */
export function useEntityInScope({
  entity,
  entityId,
  spaceId,
  spaceIds,
}: {
  entity: Entity | null;
  entityId: string;
  spaceId: string;
  spaceIds: readonly string[];
}): Entity | null {
  const widens = spaceIds.some(id => !ID.equals(id, spaceId));
  const { entity: allSpacesEntity } = useQueryEntity({ id: entityId, enabled: widens });
  return React.useMemo(
    () => (widens ? withScopeRelations(entity, allSpacesEntity, spaceIds, spaceId) : entity),
    [allSpacesEntity, entity, spaceId, spaceIds, widens]
  );
}

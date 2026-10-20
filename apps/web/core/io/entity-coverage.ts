import { equals } from '~/core/id/normalize';
import type { Entity } from '~/core/types';

export type EntityBaseline = Pick<
  Entity,
  'values' | 'relations' | 'valuesComplete' | 'relationsComplete' | 'relationsTotalCount' | 'queriedSpaceId'
>;

/** An omitted operation proves absence only when the response covers its space and entire list. */
export function hasCompleteEntityList(entity: EntityBaseline, list: 'values' | 'relations', spaceId: string): boolean {
  if (entity.queriedSpaceId && !equals(entity.queriedSpaceId, spaceId)) return false;
  if (list === 'values') return entity.valuesComplete !== false;
  return (
    entity.relationsComplete !== false &&
    (Boolean(entity.queriedSpaceId) || (entity.relationsTotalCount ?? 0) <= entity.relations.length)
  );
}

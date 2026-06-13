import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { parseFiltersSync } from '~/core/blocks/data/filters';
import { ID } from '~/core/id';
import { RANKING_BLOCK_TYPE_ID, RANKING_BLOCK_TYPE_NAME } from '~/core/ranking-block-ids';
import type { Relation, Value } from '~/core/types';

export function isRankingBlockEntity(blockId: string, relations: Relation[], spaceId: string): boolean {
  return relations.some(
    r =>
      r.fromEntity.id === blockId &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.spaceId === spaceId &&
      !r.isDeleted &&
      (ID.equals(r.toEntity.id, RANKING_BLOCK_TYPE_ID) || r.toEntity.name === RANKING_BLOCK_TYPE_NAME)
  );
}

export function isRankingSetupConfigured(
  blockId: string,
  blockName: string | null | undefined,
  filterValues: Value[],
  spaceId: string
): boolean {
  const name = blockName?.trim();
  if (!name) return false;

  const filterTriple = filterValues.find(
    v => v.entity.id === blockId && v.property.id === SystemIds.FILTER && v.spaceId === spaceId && !v.isDeleted
  );
  if (!filterTriple?.value) return false;

  const { filters } = parseFiltersSync(filterTriple.value);
  return filters.some(f => f.columnId === SystemIds.TYPES_PROPERTY);
}

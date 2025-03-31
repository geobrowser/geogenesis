import { SystemIds } from '@graphprotocol/grc-20';
import { dedupeWith } from 'effect/Array';

import { getRelations } from '~/core/database/relations';
import { fetchColumns } from '~/core/io/fetch-columns';
import { EntityId } from '~/core/io/schema';
import { queryClient } from '~/core/query-client';
import { PropertySchema } from '~/core/types';

const queryKeys = {
  columns: (typeIds: string[]) => ['blocks', 'data', 'query', 'columns', 'merging', typeIds] as const,
};

/**
 * Fetches the filterable fields for a data block depending on the applied
 * type filters.
 *
 * This is effectively the schema for the types + their value types
 *
 * @TODO: This is fetched in other parts of the app. We should unify them into
 * a single query.
 */
export async function mergeFilterableProperties(typeIds: string[]): Promise<PropertySchema[]> {
  const cachedColumns = await queryClient.fetchQuery({
    queryKey: queryKeys.columns(typeIds),
    queryFn: () => fetchColumns({ typeIds: typeIds }),
  });

  const localAttributesForSelectedType = getRelations({
    selector: r => r.typeOf.id === EntityId(SystemIds.PROPERTIES) && typeIds.includes(r.fromEntity.id),
  }).map((r): PropertySchema => {
    return {
      id: r.toEntity.id,
      name: r.toEntity.name,
      // @TODO: use the real value type
      valueType: SystemIds.TEXT,
    };
  });

  return dedupeWith([...cachedColumns, ...localAttributesForSelectedType], (a, b) => a.id === b.id);
}

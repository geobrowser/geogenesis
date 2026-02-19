import type { EntityFilter, UuidFilter, UuidListFilter } from '~/core/gql/graphql';

export function extractSingleTypeIdFromFilter(filter?: EntityFilter): string | undefined {
  if (!filter?.typeIds) return undefined;

  const typeIds: UuidListFilter = filter.typeIds;

  if (typeIds.anyEqualTo) {
    return typeIds.anyEqualTo;
  }

  if (typeIds.in && typeIds.in.length === 1 && typeIds.in[0]) {
    return typeIds.in[0];
  }

  return undefined;
}

export function extractTypeIdsFromFilter(filter?: EntityFilter): UuidFilter | undefined {
  if (!filter?.typeIds) return undefined;

  const typeIds: UuidListFilter = filter.typeIds;

  if (typeIds.in && typeIds.in.length > 1) {
    const validIds = typeIds.in.filter((v): v is string => typeof v === 'string');
    if (validIds.length > 0) {
      return { in: validIds };
    }
  }

  if (typeIds.anyEqualTo) {
    return { is: typeIds.anyEqualTo };
  }

  return undefined;
}

export function removeTypeIdsFromFilter(filter?: EntityFilter): EntityFilter | undefined {
  if (!filter?.typeIds) return filter;
  const { typeIds: _typeIds, ...rest } = filter;
  return Object.keys(rest).length > 0 ? (rest as EntityFilter) : undefined;
}

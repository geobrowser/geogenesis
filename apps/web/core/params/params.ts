import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store';
import { InitialTripleStoreParams } from '~/core/state/triple-store';
import { FilterField, FilterState } from '~/core/types';

export function parseTripleQueryFilterFromParams(params: { query?: string; page?: string }): InitialTripleStoreParams {
  const filterStateResult = Object.entries(params)
    .map(([key, value]) => {
      if (key === 'query' || key === 'page' || key === 'typeId') return null; // filter out additional params
      if (!value) return null;
      return { field: key as FilterField, value };
    })
    .flatMap(x => (x ? [x] : [])); // filter out null values

  return {
    query: params.query ?? '',
    pageNumber: Number(params.page ?? 0),
    filterState: filterStateResult,
  };
}

export function parseEntityTableQueryFilterFromUrl(url: string): InitialEntityTableStoreParams {
  const params = new URLSearchParams(url.split('?')[1]);
  const query = params.get('query') || '';
  const pageNumber = Number(params.get('page') || 0);
  const typeId = params.get('typeId') || '';
  const activeAdvancedFilterKeys = [...params.keys()].filter(
    key => key !== 'query' && key !== 'page' && key !== 'typeId'
  );

  const filterStateResult = activeAdvancedFilterKeys.reduce<FilterState>((acc, key) => {
    const value = params.get(key);
    if (!value) return acc;
    return [...acc, { field: key as FilterField, value }];
  }, []);

  return {
    query,
    pageNumber,
    typeId,
    filterState: filterStateResult,
  };
}

export function parseEntityTableQueryFilterFromParams(params: {
  query?: string;
  page?: string;
  typeId?: string;
}): InitialEntityTableStoreParams {
  const filterStateResult = Object.entries(params)
    .map(([key, value]) => {
      if (key === 'query' || key === 'page' || key === 'typeId') return null; // filter out additional params
      if (!value) return null;
      return { field: key as FilterField, value };
    })
    .flatMap(x => (x ? [x] : [])); // filter out null values

  return {
    query: params.query ?? '',
    pageNumber: Number(params.page ?? 0),
    typeId: params.typeId ?? '',
    filterState: filterStateResult,
  };
}

export function stringifyEntityTableParameters({
  query,
  pageNumber,
  filterState,
  typeId,
}: InitialEntityTableStoreParams): string {
  const params = new URLSearchParams({
    ...(query !== '' && { query }),
    ...(typeId && { typeId }),
    ...(pageNumber !== 0 && { page: pageNumber.toString() }),
    ...getAdvancedQueryParams(filterState),
  });

  return params.toString();
}

export function stringifyQueryParameters({ query, pageNumber, filterState }: InitialTripleStoreParams): string {
  const params = new URLSearchParams({
    ...(query !== '' && { query }),
    ...(pageNumber !== 0 && { page: pageNumber.toString() }),
    ...getAdvancedQueryParams(filterState),
  });

  return params.toString();
}

export function getAdvancedQueryParams(filterState: FilterState): Record<FilterField, string> | object {
  if (filterState.length === 0) {
    return {};
  }

  // We currently encode the entity-name filter into the base query=x param. If the only
  // advanced filter is entity-name, we can skip it.
  if (filterState.length === 1 && filterState[0].field === 'entity-name') {
    return {};
  }

  return filterState.reduce<Record<string, string>>((acc, filter) => {
    if (filter.field) {
      acc[filter.field] = filter.value;
    }

    return acc;
  }, {});
}

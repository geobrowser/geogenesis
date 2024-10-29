import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store/entity-table-store-params';
import { FilterField } from '~/core/types';

import { InitialTripleStoreParams } from '../state/triple-store/triple-store';

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

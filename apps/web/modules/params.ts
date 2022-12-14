import { AppConfig, AppEnv, configOptions, DEFAULT_ENV, getConfig } from './config';
import { InitialTripleStoreParams } from './state/triple-store';
import { FilterField, FilterState } from './types';

function parseQueryParameters(url: string): InitialTripleStoreParams {
  const params = new URLSearchParams(url.split('?')[1]);
  const query = params.get('query') || '';
  const pageNumber = Number(params.get('page') || 0);
  const activeAdvancedFilterKeys = [...params.keys()].filter(key => key !== 'query' && key !== 'page');

  const filterStateResult = activeAdvancedFilterKeys.reduce<FilterState>((acc, key) => {
    const value = params.get(key);
    if (!value) return acc;
    return [...acc, { field: key as FilterField, value }];
  }, []);

  return {
    query,
    pageNumber,
    filterState: filterStateResult,
  };
}

function stringifyQueryParameters({ query, pageNumber, filterState }: InitialTripleStoreParams): string {
  const params = new URLSearchParams({
    ...(query !== '' && { query }),
    ...(pageNumber !== 0 && { page: pageNumber.toString() }),
    ...getAdvancedQueryParams(filterState),
  });

  return params.toString();
}

function getAdvancedQueryParams(filterState: FilterState): Record<FilterField, string> | object {
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

function getConfigFromUrl(url: string): AppConfig {
  const params = new URLSearchParams(url.split('?')[1]);
  const env: AppEnv = (params.get('env') as AppEnv) ?? DEFAULT_ENV;

  if (!(env in configOptions)) {
    console.log(`Invalid environment "${env}", defaulting to ${DEFAULT_ENV}`);
    return configOptions[DEFAULT_ENV];
  }

  const config = configOptions[env];
  return getConfig(config.chainId);
}

export const Params = {
  parseQueryParameters,
  stringifyQueryParameters,
  getConfigFromUrl,
};

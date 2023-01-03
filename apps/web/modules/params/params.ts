import { AppConfig, AppEnv, Config } from '../config';
import { FilterField, FilterState } from '../types';
import { InitialTripleStoreParams, InitialEntityTableStoreParams } from '~/modules/triple';
import { A } from '@mobily/ts-belt';
import { isOnlyEntityNameFilter } from '../utils';

export function parseTripleQueryParameters(url: string): InitialTripleStoreParams {
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

export function parseEntityTableQueryParameters(url: string): InitialEntityTableStoreParams {
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
  if (A.isEmpty(filterState)) {
    return {};
  }

  // We currently encode the entity-name filter into the base query=x param. If the only
  // advanced filter is entity-name, we can skip it.
  if (isOnlyEntityNameFilter(filterState)) {
    return {};
  }

  return filterState.reduce<Record<string, string>>((acc, filter) => {
    if (filter.field) {
      acc[filter.field] = filter.value;
    }

    return acc;
  }, {});
}

/**
 * We currently set the environment and API URLs based on the chain that the connected wallet
 * is connected to. As a dev this can be annoying since we may not have a wallet connected or
 * may want to connect to a different environment.
 *
 * There is an escape hatch for this by setting the `ENV_PARAM_NAME` query param in the URL.
 * Each SSR'd page should read from this param and set the application config in server-fetched
 * situations based on this param.
 *
 * As a developer experience enhancement, we set this configured escape hatch in a cookie so you
 * don't have to manually add the param to the URL each time there is a page navigation.
 *
 * The priority order of URL param and cookie is:
 * 1. URL param
 * 2. Cookie
 * 3. Defaults to production if neither are set.
 *
 * @param url -- The full URL to parse the param from.
 * @param cookie -- The cookie value for the environment from the `ENV_PARAM_NAME` cookie name.
 * @returns AppConfig
 */
export function getConfigFromUrl(url: string, cookie: string | undefined): AppConfig {
  const params = new URLSearchParams(url.split('?')[1]);
  const env: AppEnv = params.get('env') as AppEnv;

  if (!(cookie && cookie in Config.options) && !(env in Config.options)) {
    console.log(`Invalid environment "${env}", defaulting to ${Config.DEFAULT_ENV}`);
    return Config.options[Config.DEFAULT_ENV];
  }

  // Default to the environment if it's set, otherwise use the cookie
  const config = Config.options[env ?? cookie];
  return Config.getConfig(config.chainId);
}

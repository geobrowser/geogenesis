import { AppConfig, Environment } from '~/core/environment';
import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store';
import { AppEnv, FilterField, FilterState, ServerSideEnvParams } from '~/core/types';

export const ENV_PARAM_NAME = 'env';

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

  if (!(cookie && cookie in Environment.options) && !(env in Environment.options)) {
    console.log(`Invalid environment "${env}", defaulting to ${Environment.DEFAULT_ENV}`);
    return Environment.options[Environment.DEFAULT_ENV];
  }

  // Default to the environment if it's set, otherwise use the cookie
  const config = Environment.options[env ?? cookie];
  return Environment.getConfig(config.chainId);
}

export function getConfigFromParams(searchParams: ServerSideEnvParams, cookie: string | undefined): AppConfig {
  const env: AppEnv | undefined = searchParams['env'] as AppEnv;

  if (!(cookie && cookie in Environment.options) && !(env && env in Environment.options)) {
    console.log(`Invalid environment "${env}", defaulting to ${Environment.DEFAULT_ENV}`);
    return Environment.options[Environment.DEFAULT_ENV];
  }

  // Default to the environment if it's set, otherwise use the cookie
  const config = Environment.options[env ?? cookie];
  return Environment.getConfig(config.chainId);
}

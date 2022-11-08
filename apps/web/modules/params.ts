import { AppConfig, AppEnv, configOptions, getConfig } from './config';
import { InitialTripleStoreParams } from './state/triple-store';

export function parseQueryParameters(url: string): InitialTripleStoreParams {
  const params = new URLSearchParams(url.split('?')[1]);
  const query = params.get('query') || '';
  const pageNumber = Number(params.get('page') || 0);

  return {
    query,
    pageNumber,
  };
}

export function stringifyQueryParameters({ query, pageNumber }: InitialTripleStoreParams): string {
  const params = new URLSearchParams({
    ...(query !== '' && { query }),
    ...(pageNumber !== 0 && { page: pageNumber.toString() }),
  });

  return params.toString();
}

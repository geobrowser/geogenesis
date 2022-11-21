import { AppConfig, AppEnv, configOptions, DEFAULT_ENV, getConfig } from './config';
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

export function getConfigFromUrl(url: string): AppConfig {
  const params = new URLSearchParams(url.split('?')[1]);
  const env: AppEnv = (params.get('env') as AppEnv) ?? DEFAULT_ENV;

  if (!(env in configOptions)) {
    console.log(`Invalid environment "${env}", defaulting to ${DEFAULT_ENV}`);
    return configOptions[DEFAULT_ENV];
  }

  const config = configOptions[env];
  return getConfig(config.chainId);
}

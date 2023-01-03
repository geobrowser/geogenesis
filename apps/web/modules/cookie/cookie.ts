import { ENV_PARAM_NAME } from '../constants';

export function getEnv(url: string) {
  const params = new URLSearchParams(url.split('?')?.[1]);
  return params.get(ENV_PARAM_NAME);
}

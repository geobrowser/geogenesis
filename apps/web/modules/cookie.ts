import { Params } from './params';

function getEnv(url: string) {
  const params = new URLSearchParams(url.split('?')?.[1]);
  return params.get(Params.ENV_PARAM_NAME);
}

export const Cookie = {
  getEnv,
};

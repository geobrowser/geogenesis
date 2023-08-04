import { Params } from '../params';

export const HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY = 'hasDismissedPersonalSpaceOnboarding';

export function getEnv(url: string) {
  const params = new URLSearchParams(url.split('?')?.[1]);
  return params.get(Params.ENV_PARAM_NAME);
}

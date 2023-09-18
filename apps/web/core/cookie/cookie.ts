import { cookies } from 'next/headers';

import { Params } from '../params';

export const HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY = 'hasDismissedPersonalSpaceOnboarding';
export const WALLET_ADDRESS = 'walletAddress';

export function getEnv(url: string) {
  const params = new URLSearchParams(url.split('?')?.[1]);
  return params.get(Params.ENV_PARAM_NAME);
}

export async function onConnectionChange(type: 'connect' | 'disconnect', address: string) {
  'use server';

  if (type === 'disconnect') {
    cookies().delete(WALLET_ADDRESS);
  } else if (type === 'connect') {
    cookies().set(WALLET_ADDRESS, address);
  }
}

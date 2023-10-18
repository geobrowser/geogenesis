import { cookies } from 'next/headers';

export const HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY = 'hasDismissedPersonalSpaceOnboarding';
export const WALLET_ADDRESS = 'walletAddress';

export async function onConnectionChange(type: 'connect' | 'disconnect', address: string) {
  'use server';

  if (type === 'disconnect') {
    cookies().delete(WALLET_ADDRESS);
  } else if (type === 'connect') {
    cookies().set(WALLET_ADDRESS, address);
  }
}

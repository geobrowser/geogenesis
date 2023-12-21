'use server';

import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '.';

export async function onConnectionChange(type: 'connect' | 'disconnect', address: string) {
  if (type === 'disconnect') {
    cookies().delete(WALLET_ADDRESS);
  } else if (type === 'connect') {
    cookies().set(WALLET_ADDRESS, address, {
      // 400 days expiration date. Google chrome only allows cookies to be
      // set to last 400 days at most. Firefox 2 years.
      maxAge: 1000 * 60 * 60 * 24 * 400,
    });
  }
}

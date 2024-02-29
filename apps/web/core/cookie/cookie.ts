'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '.';

type ConnectionChangeArgs =
  | {
      type: 'connect';
      address: `0x${string}`;
    }
  | {
      type: 'disconnect';
    };

export async function onConnectionChange(connectionChange: ConnectionChangeArgs) {
  console.log('connection change', connectionChange.type);
  switch (connectionChange.type) {
    case 'connect':
      cookies().set(WALLET_ADDRESS, connectionChange.address, {
        maxAge: 1000 * 60 * 60 * 24 * 400,
      });
      break;
    case 'disconnect':
      cookies().delete(WALLET_ADDRESS);
      break;
  }
}

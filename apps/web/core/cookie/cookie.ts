'use server';

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
  switch (connectionChange.type) {
    case 'connect':
      (await cookies()).set(WALLET_ADDRESS, connectionChange.address, {
        maxAge: 1000 * 60 * 60 * 24 * 400,
      });
      break;
    case 'disconnect':
      (await cookies()).delete(WALLET_ADDRESS);
      break;
  }

  return connectionChange.type === 'connect' ? connectionChange.address : null;
}

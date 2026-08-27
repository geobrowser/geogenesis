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
      // httpOnly: keeps page JS (and any injected script) from rewriting the
      //   cookie to forge another wallet — the chat route trusts this value.
      // sameSite: 'lax': blocks cross-site sends so a CSRF can't ride it.
      // secure: required for sameSite outside dev.
      (await cookies()).set(WALLET_ADDRESS, connectionChange.address, {
        maxAge: 1000 * 60 * 60 * 24 * 400,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      break;
    case 'disconnect':
      (await cookies()).delete(WALLET_ADDRESS);
      break;
  }

  return connectionChange.type === 'connect' ? connectionChange.address : null;
}

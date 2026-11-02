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

/**
 * Writes only when the cookie would actually change. Next treats any cookie write inside a Server
 * Action as a revalidation: the client drops its prefetch cache and re-renders the current page
 * from the server, and if a deploy has shipped since the tab loaded, that re-render becomes a full
 * browser reload. `useSmartAccount` calls this on every smart-account refetch, so an unconditional
 * write reloaded pages left sitting open. Reading the cookie does not count as a revalidation.
 */
export async function onConnectionChange(connectionChange: ConnectionChangeArgs) {
  const cookieStore = await cookies();

  switch (connectionChange.type) {
    case 'connect':
      if (cookieStore.get(WALLET_ADDRESS)?.value === connectionChange.address) break;
      // httpOnly: keeps page JS (and any injected script) from rewriting the
      //   cookie to forge another wallet — the chat route trusts this value.
      // sameSite: 'lax': blocks cross-site sends so a CSRF can't ride it.
      // secure: required for sameSite outside dev.
      cookieStore.set(WALLET_ADDRESS, connectionChange.address, {
        maxAge: 1000 * 60 * 60 * 24 * 400,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      break;
    case 'disconnect':
      if (cookieStore.has(WALLET_ADDRESS)) cookieStore.delete(WALLET_ADDRESS);
      break;
  }

  return connectionChange.type === 'connect' ? connectionChange.address : null;
}

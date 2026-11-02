import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { isSameOrigin } from '../same-origin';

/**
 * Clears the wallet cookie. Called by the feed when Privy has restored and found no session, so a
 * cookie left behind by an expired session stops making every later load wait for a sign-in that
 * is not coming (see `useFeedViewer`). Deleting it only ever makes the reader anonymous, and a
 * reader who is in fact signed in gets it written back when their smart account loads.
 */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const cookieStore = await cookies();
  if (cookieStore.has(WALLET_ADDRESS)) cookieStore.delete(WALLET_ADDRESS);
  return new Response(null, { status: 204 });
}

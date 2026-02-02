import { Effect } from 'effect';

import { getSpaceByAddress } from '~/core/io/queries';

/** Look up a user's personal space ID from their wallet address via the GraphQL API. */
export async function getPersonalSpaceId(walletAddress: string): Promise<string | null> {
  const space = await Effect.runPromise(getSpaceByAddress(walletAddress));
  return space?.id ?? null;
}

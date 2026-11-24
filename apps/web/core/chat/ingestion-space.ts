import type { QueryClient } from '@tanstack/react-query';

import { type WriteSpace, pickWriteSpace } from '~/core/access/pick-write-space';
import type { SendSpaceTransaction } from '~/core/access/request-space-membership';

/**
 * The space a Sources `+` import writes into (GEO-3819): see `pickWriteSpace`.
 *
 * Someone who can edit the page's space (an editor or a member) imports into it. Anyone else imports
 * into their own personal space, so the source and its link land right away: a membership request
 * needs an editor to accept it, and until then nothing they wrote into the page's space could be
 * published.
 *
 * The pick says which of the two it is (`personal`), and that answer travels with the import, so
 * the assistant never has to work it out again from the route, which may have changed by the time a
 * queued import replays.
 */
export type IngestionWriteSpace = WriteSpace;

export function pickIngestionSpace(args: {
  pageSpaceId: string | null;
  personalSpaceId: string;
  tx: SendSpaceTransaction;
  queryClient: QueryClient;
}): Promise<IngestionWriteSpace> {
  return pickWriteSpace({ ...args, writers: 'members' });
}

/**
 * The chat context an import's turns go out with, given the space its seed picked.
 *
 * The agent writes into the context's current space, or into the server's own read of the viewer's
 * personal space when `writeToPersonalSpace` is set. So a seed that picked the page's space sends
 * that as the current space: a member's import queued on one page can replay after they've moved
 * to another space, and it still belongs in the page's. Whether it is a personal write comes from
 * the pick, never from comparing spaces with the route. With no pick (an Add data panel import),
 * the route's space is the target, as before.
 */
export function ingestionChatContext<C extends { currentSpaceId: string | null }>(
  context: C,
  writeSpace: IngestionWriteSpace | null | undefined
): C & { writeToPersonalSpace: boolean } {
  if (!writeSpace) return { ...context, writeToPersonalSpace: false };
  if (writeSpace.personal) return { ...context, writeToPersonalSpace: true };
  return { ...context, currentSpaceId: writeSpace.spaceId, writeToPersonalSpace: false };
}

import type { QueryClient } from '@tanstack/react-query';

import { Either } from 'effect';

import { type SendSpaceTransaction, ensureSpaceMembership } from '~/core/access/request-space-membership';
import { getSpaceAccessById } from '~/core/access/space-access';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

/**
 * The space a Sources `+` import writes into (GEO-3819).
 *
 * Someone who can edit the page's space imports into it, as before. Anyone else imports into their
 * own personal space, so the source and its link land right away, the way a vote is written to the
 * voter's own space: a membership request needs an editor to accept it, and until then nothing they
 * wrote into the page's space could be published.
 *
 * As after a vote, a non-member is also asked into the page's space in the background (the same
 * `ensureSpaceMembership` checks and dedupe). The import never waits on it, and a failed request
 * changes nothing here.
 *
 * A failed access read counts as not a member: the personal space is always writable, the page's
 * space might not be.
 *
 * The pick says which of the two it is (`personal`), and that answer travels with the import, so
 * the assistant never has to work it out again from the route, which may have changed by the time a
 * queued import replays.
 */
export type IngestionWriteSpace = {
  spaceId: string;
  /** The viewer's own personal space rather than the page's (a non-member's import). */
  personal: boolean;
};

export async function pickIngestionSpace({
  pageSpaceId,
  personalSpaceId,
  tx,
  queryClient,
}: {
  pageSpaceId: string | null;
  personalSpaceId: string;
  tx: SendSpaceTransaction;
  queryClient: QueryClient;
}): Promise<IngestionWriteSpace> {
  const personal = { spaceId: personalSpaceId, personal: true };
  if (!pageSpaceId) return personal;

  const access = await runEffectEither(getSpaceAccessById(pageSpaceId, personalSpaceId));
  if (Either.isRight(access) && access.right.canEdit) return { spaceId: pageSpaceId, personal: false };

  void ensureSpaceMembership({ spaceId: pageSpaceId, personalSpaceId, tx, queryClient });
  return personal;
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

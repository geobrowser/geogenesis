import type { QueryClient } from '@tanstack/react-query';

import { Either } from 'effect';

import { type SendSpaceTransaction, ensureSpaceMembership } from '~/core/access/request-space-membership';
import { getSpaceAccessById } from '~/core/access/space-access';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

/**
 * Where a viewer's write from a page lands: the page's space, or their own personal space.
 *
 * `personal` travels with the write, so a queued write that replays later never has to work it out
 * again from a route that may have changed.
 */
export type WriteSpace = {
  spaceId: string;
  /** The viewer's own personal space rather than the page's. */
  personal: boolean;
};

/**
 * Who writes straight into the page's space.
 *
 * - `members`: editors and members (Sources imports, GEO-3819).
 * - `editors`: editors only. A non-editor member's publish in a DAO space is a slow proposal that
 *   waits for votes, so their write goes to their personal space instead, where it lands at once.
 */
export type PageSpaceWriters = 'members' | 'editors';

/**
 * Picks the space a signed-in viewer's write goes to.
 *
 * Anyone the page's space admits as a writer writes into it. Everyone else writes into their own
 * personal space, the way a vote is written to the voter's own space, and a non-member is also asked
 * into the page's space in the background (the same `ensureSpaceMembership` checks and dedupe). The
 * write never waits on that request, and a failed one changes nothing here.
 *
 * A failed access read counts as no access: the personal space is always writable, the page's space
 * might not be.
 */
export async function pickWriteSpace({
  pageSpaceId,
  personalSpaceId,
  writers,
  tx,
  queryClient,
}: {
  pageSpaceId: string | null;
  personalSpaceId: string;
  writers: PageSpaceWriters;
  tx: SendSpaceTransaction;
  queryClient: QueryClient;
}): Promise<WriteSpace> {
  const personal = { spaceId: personalSpaceId, personal: true };
  if (!pageSpaceId) return personal;

  const access = await runEffectEither(getSpaceAccessById(pageSpaceId, personalSpaceId));
  if (Either.isRight(access)) {
    const admitted = writers === 'editors' ? access.right.isEditor : access.right.canEdit;
    if (admitted) return { spaceId: pageSpaceId, personal: false };
    // A member already belongs to the space; only a non-member is asked in.
    if (access.right.isMember) return personal;
  }

  void ensureSpaceMembership({ spaceId: pageSpaceId, personalSpaceId, tx, queryClient });
  return personal;
}

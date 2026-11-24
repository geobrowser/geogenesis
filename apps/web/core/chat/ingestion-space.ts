import type { QueryClient } from '@tanstack/react-query';

import { Either } from 'effect';

import { type SendSpaceTransaction, ensureSpaceMembership } from '~/core/access/request-space-membership';
import { getSpaceAccessById } from '~/core/access/space-access';
import { ID } from '~/core/id';
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
 */
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
}): Promise<string> {
  if (!pageSpaceId) return personalSpaceId;

  const access = await runEffectEither(getSpaceAccessById(pageSpaceId, personalSpaceId));
  if (Either.isRight(access) && access.right.canEdit) return pageSpaceId;

  void ensureSpaceMembership({ spaceId: pageSpaceId, personalSpaceId, tx, queryClient });
  return personalSpaceId;
}

/**
 * Where the assistant writes a seeded import: the seed's own space when it names one, else the
 * route's. `personalWrite` is true when that isn't the route's space — a non-member's import into
 * their personal space — which the chat path tells the agent so its write tools target it.
 */
export function ingestionWriteTarget(
  seedSpaceId: string | undefined,
  currentSpaceId: string | null
): { spaceId: string | null; personalWrite: boolean } {
  if (!seedSpaceId) return { spaceId: currentSpaceId, personalWrite: false };
  return {
    spaceId: seedSpaceId,
    personalWrite: !(currentSpaceId && ID.equals(seedSpaceId, currentSpaceId)),
  };
}

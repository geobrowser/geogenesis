import type { QueryClient } from '@tanstack/react-query';

import { Either } from 'effect';

import { type SendSpaceTransaction, ensureSpaceMembership } from '~/core/access/request-space-membership';
import { getSpaceAccessById } from '~/core/access/space-access';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

/** Where a viewer's write lands. `personal` travels with it, so a queued replay never re-derives it. */
export type WriteSpace = {
  spaceId: string;
  /** The viewer's own personal space rather than the page's. */
  personal: boolean;
};

/**
 * Who writes straight into the page's space: `members` (editors and members) or `editors` only. A
 * non-editor member's publish in a DAO space would be a slow proposal waiting on votes.
 */
export type PageSpaceWriters = 'members' | 'editors';

/**
 * The page's space for an admitted writer, otherwise the viewer's personal space (always writable,
 * so a failed access read lands there too). A non-member is also asked to join, without waiting.
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

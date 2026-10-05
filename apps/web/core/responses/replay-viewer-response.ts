'use client';

import type { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { readCachedSmartAccount, readRegisteredPersonalSpaceId } from '~/core/hooks/cached-write-identity';
import { getUserEntityResponse } from '~/core/io/queries';

import type { ResponseKind, ResponseObjectType } from './entity-response';

/**
 * The side the viewer holds on an entity, asked of the index at the moment a queued vote replays.
 *
 * For a replay with no control on screen to ask. The press's own closure was taken signed out, when
 * "holds nothing" was the honest answer; read back now, for an account that may have held a side all
 * along, it would republish that side. So the replay asks fresh, for the account that is signed in.
 */
export async function readViewerResponseForReplay(
  queryClient: QueryClient,
  {
    entityId,
    spaceId,
    responseKind,
    objectType,
  }: { entityId: string; spaceId: string; responseKind: ResponseKind; objectType: ResponseObjectType }
) {
  const account = readCachedSmartAccount(queryClient, null);
  const personalSpaceId = readRegisteredPersonalSpaceId(queryClient, account?.account.address, {
    personalSpaceId: null,
    isRegistered: false,
  });
  // The runner only replays once a space exists, so this is a cache that has not caught up: retry.
  if (!personalSpaceId) throw new Error('Your personal space is not ready yet.');
  return Effect.runPromise(getUserEntityResponse(personalSpaceId, entityId, spaceId, responseKind, objectType));
}

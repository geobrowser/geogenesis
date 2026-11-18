import { cache } from 'react';

import { Effect } from 'effect';

import { fetchDebatePageMedia } from '~/core/debates/server/debate-page-media';
import { type DebateVisibility, readDebateVisibility } from '~/core/debates/server/debate-visibility';
import { getBatchEntities, getEntity, getEntityPage } from '~/core/io/queries';
import { Entity, Relation } from '~/core/types';

import { Telemetry } from '~/app/api/telemetry';

export const cachedFetchEntity = cache(async (entityId: string, spaceId?: string): Promise<Entity | null> => {
  return await Effect.runPromise(getEntity(entityId, spaceId));
});

export const cachedFetchEntityPage = cache(
  async (entityId: string, spaceId?: string): Promise<{ entity: Entity | null; relations: Relation[] } | null> => {
    return await Effect.runPromise(
      getEntityPage(entityId, spaceId).pipe(
        Effect.withSpan('web.cachedFetchEntityPage'),
        Effect.annotateSpans({ entityId, spaceId }),
        Effect.provide(Telemetry)
      )
    );
  }
);

export const cachedFetchEntitiesBatch = cache(async (entityIds: string[], spaceId?: string): Promise<Entity[]> => {
  return await Effect.runPromise(getBatchEntities(entityIds, spaceId));
});

/**
 * geo-chat's answer on whether a Debate entity was removed (GEO-2785), once per request: the page,
 * its metadata and its share image all ask, and a removed debate must answer the same to each.
 * The same read's body is the linked debate the page hands its feed (GEO-3604).
 */
export const cachedReadDebateVisibility = cache(readDebateVisibility);

export const cachedFetchDebateVisibility = async (entityId: string): Promise<DebateVisibility> =>
  (await cachedReadDebateVisibility(entityId)).visibility;

/** The linked debate's media readiness, for the page's feed (GEO-3604). */
export const cachedFetchDebatePageMedia = cache((entityId: string) => fetchDebatePageMedia(entityId));

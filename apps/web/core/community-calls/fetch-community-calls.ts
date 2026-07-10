import { Effect } from 'effect';

import { getAllEntities, getBatchEntities, getResults, getSpaces } from '~/core/io/queries';

import { CALL_SCHEMA } from './constants';
import { CallSeries } from './types';
import { Telemetry } from '~/app/api/telemetry';

/**
 * Fetch the CommunityCall series entities in a space (server-side). Returns the
 * raw schedule string per call; occurrence expansion happens client-side so the
 * live/upcoming/past split stays fresh relative to the viewer's clock.
 *
 * Returns [] when the CommunityCall type id isn't configured yet, so the tab
 * renders an empty state instead of erroring.
 */
export async function fetchCommunityCalls(spaceId: string): Promise<CallSeries[]> {
  if (!CALL_SCHEMA.COMMUNITY_CALL_TYPE) return [];

  const page = await Effect.runPromise(
    getAllEntities({ spaceId, typeId: CALL_SCHEMA.COMMUNITY_CALL_TYPE, limit: 200 }).pipe(
      Effect.withSpan('web.fetchCommunityCalls'),
      Effect.annotateSpans({ spaceId }),
      Effect.provide(Telemetry)
    )
  );

  return page.entities.flatMap(entity => {
    const schedule = entity.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value;
    if (!schedule) return [];

    return [
      {
        callId: entity.id,
        spaceId,
        name: entity.name ?? 'Untitled call',
        description: entity.description,
        schedule,
      } satisfies CallSeries,
    ];
  });
}

/** A community call plus its space's name/avatar, for the cross-space explore digest. */
export type ExploreCall = CallSeries & { spaceName: string; spaceImage: string | null };

/**
 * Fetch CommunityCall series across every space. Joins each call to its space's
 * name + avatar so the digest can render a space chip. Returns [] when the type
 * id isn't configured, so the section hides.
 */
export async function fetchCommunityCallsForExplore(): Promise<ExploreCall[]> {
  if (!CALL_SCHEMA.COMMUNITY_CALL_TYPE) return [];

  // Canonical-graph filter — the same `include_non_canonical=false` the search bar uses.
  // Listing by type alone returns hundreds of calls from test spaces (Rapporteur Test Space,
  // Walaa 03, SITEST); the canonical filter trims that to the curated graph. The REST search
  // doesn't carry the Meeting Time value, so we use it only to pick which entities to hydrate,
  // then batch-fetch those for their schedules.
  const canonical = await Effect.runPromise(
    getResults({
      query: '',
      typeIds: [CALL_SCHEMA.COMMUNITY_CALL_TYPE],
      includeNonCanonical: false,
      limit: 200,
    }).pipe(Effect.withSpan('web.fetchCommunityCallsForExplore'), Effect.provide(Telemetry))
  ).catch(() => []);

  const callIds = canonical.map(r => r.id);
  if (callIds.length === 0) return [];

  const entities = await Effect.runPromise(getBatchEntities(callIds)).catch(() => []);

  const calls = entities.flatMap(entity => {
    const meeting = entity.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY);
    const spaceId = meeting?.spaceId ?? entity.spaces[0];
    if (!meeting?.value || !spaceId) return [];

    return [
      {
        callId: entity.id,
        spaceId,
        name: entity.name ?? 'Untitled call',
        description: entity.description,
        schedule: meeting.value,
      } satisfies CallSeries,
    ];
  });

  if (calls.length === 0) return [];

  const spaceIds = [...new Set(calls.map(c => c.spaceId))];
  const spaces = await Effect.runPromise(getSpaces({ spaceIds })).catch(() => []);
  const meta = new Map(spaces.map(s => [s.id, { name: s.entity?.name ?? 'Space', image: s.entity?.image ?? null }]));

  return calls.map(c => {
    const m = meta.get(c.spaceId);
    return { ...c, spaceName: m?.name ?? 'Space', spaceImage: m?.image ?? null };
  });
}

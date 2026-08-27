import { cache } from 'react';

import { Effect } from 'effect';

import { getAllEntities, getBatchEntities, getResultsPage, getSpaces } from '~/core/io/queries';

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
export const fetchCommunityCalls = cache(async (spaceId: string): Promise<CallSeries[]> => {
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
    if (!schedule) {
      // A call with no usable schedule cannot be placed on a timeline, so it has to come out
      // of the list — but dropping it silently is how one stayed invisible with nobody able
      // to say why. `call-ops` now refuses to write this state; the log is for the rows that
      // already carry it.
      console.warn('[community-calls] skipping call with no meeting time', { entityId: entity.id });
      return [];
    }

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
});

/** A community call plus its space's name/avatar, for the cross-space explore digest. */
export type ExploreCall = CallSeries & { spaceName: string; spaceImage: string | null };

/**
 * Fetch CommunityCall series across every space. Joins each call to its space's
 * name + avatar so the digest can render a space chip. Returns [] when the type
 * id isn't configured, so the section hides.
 */
/**
 * The REST /search endpoint caps a page at 100 rows and silently clamps anything larger,
 * so asking for more is misleading rather than helpful.
 */
const SEARCH_PAGE_SIZE = 100;

export async function fetchCommunityCallsForExplore(): Promise<ExploreCall[]> {
  if (!CALL_SCHEMA.COMMUNITY_CALL_TYPE) return [];

  // Canonical-graph filter — the same `include_non_canonical=false` the search bar uses.
  // Listing by type alone returns hundreds of calls from test spaces (Rapporteur Test Space,
  // Walaa 03, SITEST); the canonical filter trims that to the curated graph. This request
  // scopes no spaces, so `buildSearchPath` applies the filter server-side and the curated
  // calls can't be crowded off the page by non-canonical ones. The REST search doesn't carry
  // the Meeting Time value, so we use it only to pick which entities to hydrate, then
  // batch-fetch those for their schedules.
  const page = await Effect.runPromise(
    getResultsPage({
      query: '',
      typeIds: [CALL_SCHEMA.COMMUNITY_CALL_TYPE],
      includeNonCanonical: false,
      limit: SEARCH_PAGE_SIZE,
    }).pipe(Effect.withSpan('web.fetchCommunityCallsForExplore'), Effect.provide(Telemetry))
  ).catch((error: unknown) => {
    // Distinguish "the search failed" from "there are no calls" — both used to render as a
    // silently missing Explore section, which is how GEO-2480 went unnoticed.
    console.error('[community-calls] explore digest search failed', error);
    return null;
  });

  if (!page) return [];

  if (page.total > SEARCH_PAGE_SIZE) {
    // One page is ample for a digest that renders three rows, but say so rather than
    // quietly dropping the tail — past the cap, "soonest upcoming" is only soonest
    // among the rows the endpoint ranked highest.
    console.warn(
      `[community-calls] ${page.total} canonical calls exceed the ${SEARCH_PAGE_SIZE}-row page cap; the explore digest covers the first page only`
    );
  }

  const callIds = page.results.map(r => r.id);
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

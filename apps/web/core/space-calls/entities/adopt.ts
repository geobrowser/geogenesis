import { Effect } from 'effect';

import { EVENT_SCHEMA, OCCURRENCE_MATCH_TOLERANCE_MS } from '~/core/community-calls/constants';
import { eventOccurrenceStart } from '~/core/community-calls/fetch-occurrence-event';
import { ID } from '~/core/id';
import { getBatchEntities, getEntityBacklinks } from '~/core/io/queries';
import type { Entity } from '~/core/types';

import type { CallEntityClaim } from './service';

type Deps = {
  backlinks?: (seriesId: string, spaceId: string) => Promise<Array<{ id: string; types?: Array<{ id: string }> }>>;
  entities?: (ids: string[], spaceId: string) => Promise<Entity[]>;
};

const defaultBacklinks = (seriesId: string, spaceId: string) =>
  Effect.runPromise(getEntityBacklinks(seriesId, spaceId));
const defaultEntities = (ids: string[], spaceId: string) => Effect.runPromise(getBatchEntities(ids, spaceId));

/** Claims that could match an event curator already wrote: nothing recorded yet, and a series slot. */
export function needsCuratorLookup(claim: CallEntityClaim): boolean {
  return (
    claim.action === 'create' &&
    claim.entity_id === null &&
    claim.entity.series_id !== null &&
    claim.entity.original_start !== null
  );
}

/**
 * Curator's existing Call Event for each claimed occurrence, so the call continues that entity
 * instead of adding a second one: the event under the same series, in the same space, whose
 * occurrence start (Occurence original start, else Start time, else Meeting Time) is nearest the
 * claim's `original_start` within tolerance. Two reads per series however many claims it has.
 * Returns call id (dashless) to entity id; a claim with no match is absent. A failed read throws.
 */
export async function findCuratorCallEvents(claims: CallEntityClaim[], deps: Deps = {}): Promise<Map<string, string>> {
  const bySeries = new Map<string, CallEntityClaim[]>();
  for (const claim of claims.filter(needsCuratorLookup)) {
    const key = `${ID.uuidToHex(claim.entity.space_id)}:${ID.uuidToHex(claim.entity.series_id!)}`;
    bySeries.set(key, [...(bySeries.get(key) ?? []), claim]);
  }

  const found = new Map<string, string>();
  for (const [key, seriesClaims] of bySeries) {
    const [spaceId, seriesId] = key.split(':') as [string, string];
    const links = await (deps.backlinks ?? defaultBacklinks)(seriesId, spaceId);
    const candidateIds = [
      ...new Set(
        links
          .filter(link => link.types?.some(type => ID.equals(type.id, EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE)))
          .map(link => ID.uuidToHex(link.id))
      ),
    ];
    if (candidateIds.length === 0) continue;
    const events = await (deps.entities ?? defaultEntities)(candidateIds, spaceId);
    const taken = new Set<string>();

    for (const claim of seriesClaims) {
      const slotMs = Date.parse(claim.entity.original_start!);
      let best: { id: string; delta: number } | null = null;
      for (const event of events) {
        const id = ID.uuidToHex(event.id);
        if (taken.has(id)) continue;
        const startMs = eventOccurrenceStart(event, slotMs);
        if (startMs === null) continue;
        const delta = Math.abs(startMs - slotMs);
        if (delta <= OCCURRENCE_MATCH_TOLERANCE_MS && (!best || delta < best.delta)) best = { id, delta };
      }
      if (best) {
        taken.add(best.id);
        found.set(ID.uuidToHex(claim.call_id), best.id);
      }
    }
  }
  return found;
}

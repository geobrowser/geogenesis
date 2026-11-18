import { Effect } from 'effect';

import { EVENT_SCHEMA, OCCURRENCE_MATCH_TOLERANCE_MS } from '~/core/community-calls/constants';
import { eventOccurrenceStart } from '~/core/community-calls/fetch-occurrence-event';
import { WEB_URL_PROPERTY_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { getBatchEntities, getEntityBacklinks } from '~/core/io/queries';
import type { Entity } from '~/core/types';

import { CALL_EVENT_PUBLISHED_BY_PROPERTY_ID } from './draft';
import type { CallEntityClaim } from './service';

type Deps = {
  backlinks?: (seriesId: string, spaceId: string) => Promise<Array<{ id: string; types?: Array<{ id: string }> }>>;
  entities?: (ids: string[], spaceId: string) => Promise<Entity[]>;
};

const defaultBacklinks = (seriesId: string, spaceId: string) =>
  Effect.runPromise(getEntityBacklinks(seriesId, spaceId));
const defaultEntities = (ids: string[], spaceId: string) => Effect.runPromise(getBatchEntities(ids, spaceId));

/** The last error of a claim whose adopted event geo-chat holds for another call; it mints instead. */
export const CURATOR_EVENT_TAKEN = 'call_entity_id_taken';

/** Claims that could match an event curator already wrote: nothing recorded yet, and a series slot. */
export function needsCuratorLookup(claim: CallEntityClaim): boolean {
  return (
    claim.action === 'create' &&
    claim.entity_id === null &&
    claim.last_error !== CURATOR_EVENT_TAKEN &&
    claim.entity.series_id !== null &&
    claim.entity.original_start !== null
  );
}

type Options = {
  /** This publisher's address: an event it published is its own, never curator's. */
  publisherAddress: string;
  /** The call page URL a claim writes as Web URL. */
  pageUrlOf: (claim: CallEntityClaim) => string;
};

const CALL_PAGE_PATH = /^\/space\/[0-9a-f]{32}\/calls\/[0-9a-f]{32}\/?$/i;

const textOf = (event: Entity, propertyId: string) => {
  const value = event.values.find(v => ID.equals(v.property.id, propertyId))?.value;
  return typeof value === 'string' ? value : null;
};

/** A call page other than `ownPage` in the event's Web URL: another call already wrote it. */
function writtenByAnotherCall(event: Entity, ownPage: string): boolean {
  const url = textOf(event, WEB_URL_PROPERTY_ID);
  if (!url || url === ownPage) return false;
  try {
    return CALL_PAGE_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Curator's existing Call Event for each claimed occurrence, so the call continues that entity
 * instead of adding a second one: an event under the series by its Parent relation, in the same
 * space, not published by this publisher nor written by another call, whose occurrence start
 * (Occurence original start, else Start time, else Meeting Time) is nearest the claim's
 * `original_start` within tolerance. Returns call id (dashless) to entity id; a failed read throws.
 */
export async function findCuratorCallEvents(
  claims: CallEntityClaim[],
  { publisherAddress, pageUrlOf }: Options,
  deps: Deps = {}
): Promise<Map<string, string>> {
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
    const events = (await (deps.entities ?? defaultEntities)(candidateIds, spaceId)).filter(
      event =>
        event.relations.some(
          relation =>
            ID.equals(relation.type.id, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY) &&
            ID.equals(relation.toEntity.id, seriesId) &&
            ID.equals(relation.spaceId, spaceId)
        ) && textOf(event, CALL_EVENT_PUBLISHED_BY_PROPERTY_ID)?.toLowerCase() !== publisherAddress.toLowerCase()
    );
    const taken = new Set<string>();

    for (const claim of seriesClaims) {
      const slotMs = Date.parse(claim.entity.original_start!);
      let best: { id: string; delta: number } | null = null;
      const ownPage = pageUrlOf(claim);
      for (const event of events) {
        const id = ID.uuidToHex(event.id);
        if (taken.has(id) || writtenByAnotherCall(event, ownPage)) continue;
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

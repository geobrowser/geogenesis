import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { getBatchEntities, getEntityBacklinks, getRelationsByFromEntityId } from '~/core/io/queries';
import { Entity, Relation } from '~/core/types';

import { EVENT_SCHEMA, OCCURRENCE_MATCH_TOLERANCE_MS } from './constants';
import { isPlayableRecordingUrl } from './recordings';

export type PublishedAgendaBlock = { blockId: string; markdown: string; position: string };

export type PublishedOccurrenceEvent = {
  entityId: string;
  startMs: number;
  blocks: PublishedAgendaBlock[];
  /** The event's current BLOCKS relations — pass through to `buildPublishOccurrenceOps` so a republish can tombstone them. */
  blockRelations: Relation[];
};

/**
 * Best-effort match of an occurrence to its published `Community call event` entity: the
 * event backlink whose START_TIME is nearest `occurrenceStart` within tolerance, or null.
 */
async function matchOccurrenceEvent(
  seriesId: string,
  spaceId: string,
  occurrenceStart: number
): Promise<{ entity: Entity; startMs: number } | null> {
  if (!EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE) return null;

  const backlinks = await Effect.runPromise(getEntityBacklinks(seriesId, spaceId)).catch(() => []);
  const candidateIds = backlinks
    .filter(b => b.types?.some(t => t.id === EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE))
    .map(b => b.id);
  if (candidateIds.length === 0) return null;

  const entities = await Effect.runPromise(getBatchEntities(candidateIds)).catch(() => []);
  const scored = entities.flatMap(entity => {
    const startVal = entity.values.find(v => v.property.id === EVENT_SCHEMA.START_TIME_PROPERTY)?.value;
    const startMs = startVal ? Date.parse(startVal) : NaN;
    return Number.isFinite(startMs) ? [{ entity, startMs }] : [];
  });

  const best = scored.reduce<{ entity: Entity; startMs: number } | null>((closest, candidate) => {
    const delta = Math.abs(candidate.startMs - occurrenceStart);
    if (!closest || delta < Math.abs(closest.startMs - occurrenceStart)) return candidate;
    return closest;
  }, null);
  if (!best || Math.abs(best.startMs - occurrenceStart) > OCCURRENCE_MATCH_TOLERANCE_MS) return null;
  return best;
}

/**
 * Just the entity id of the published `Community call event` for one occurrence, or null if
 * no agenda was ever published for it. Cheaper than {@link fetchOccurrenceEvent} — skips the
 * agenda-block round trips a list link doesn't need.
 */
export async function fetchOccurrenceEventId(
  seriesId: string,
  spaceId: string,
  occurrenceStart: number
): Promise<string | null> {
  const best = await matchOccurrenceEvent(seriesId, spaceId, occurrenceStart);
  return best?.entity.id ?? null;
}

/**
 * The recording URLs already attached to a published event, so a publish can skip a recording
 * that's already there. `getRelationsByFromEntityId` runs the live decoder, so `toEntity.value`
 * is the resolved URL of the relation's Video entity.
 */
export async function fetchEventRecordingUrls(eventId: string, spaceId: string): Promise<string[]> {
  const relations = await Effect.runPromise(
    getRelationsByFromEntityId(eventId, EVENT_SCHEMA.RECORDINGS_PROPERTY, spaceId)
  ).catch(() => []);
  return relations.map(r => r.toEntity.value).filter(isPlayableRecordingUrl);
}

/**
 * Best-effort lookup of an already-published `Community call event` entity for one occurrence
 * of a series, plus its current agenda blocks (for re-editing) and BLOCKS relations (so a
 * republish can tombstone the old set before writing the new one).
 */
export async function fetchOccurrenceEvent(
  seriesId: string,
  spaceId: string,
  occurrenceStart: number
): Promise<PublishedOccurrenceEvent | null> {
  const best = await matchOccurrenceEvent(seriesId, spaceId, occurrenceStart);
  if (!best) return null;

  const blockRelations = await Effect.runPromise(
    getRelationsByFromEntityId(best.entity.id, SystemIds.BLOCKS, spaceId)
  ).catch(() => []);

  const blockIds = blockRelations.map(r => r.toEntity.id);
  const blockEntities = blockIds.length > 0 ? await Effect.runPromise(getBatchEntities(blockIds)).catch(() => []) : [];
  const blocks = blockRelations.flatMap(r => {
    const blockEntity = blockEntities.find(e => e.id === r.toEntity.id);
    const markdown = blockEntity?.values.find(v => v.property.id === SystemIds.MARKDOWN_CONTENT)?.value;
    return markdown ? [{ blockId: r.toEntity.id, markdown, position: r.position ?? '' }] : [];
  });

  return { entityId: best.entity.id, startMs: best.startMs, blocks, blockRelations };
}

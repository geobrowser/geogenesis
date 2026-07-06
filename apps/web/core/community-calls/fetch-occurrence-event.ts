import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { getBatchEntities, getEntityBacklinks, getRelationsByFromEntityId } from '~/core/io/queries';
import { Relation } from '~/core/types';

import { EVENT_SCHEMA, OCCURRENCE_MATCH_TOLERANCE_MS } from './constants';

export type PublishedAgendaBlock = { blockId: string; markdown: string; position: string };

export type PublishedOccurrenceEvent = {
  entityId: string;
  startMs: number;
  blocks: PublishedAgendaBlock[];
  /** The event's current BLOCKS relations — pass through to `buildPublishOccurrenceOps` so a republish can tombstone them. */
  blockRelations: Relation[];
};

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

  const best = scored.reduce<{ entity: (typeof scored)[number]['entity']; startMs: number } | null>(
    (closest, candidate) => {
      const delta = Math.abs(candidate.startMs - occurrenceStart);
      if (!closest || delta < Math.abs(closest.startMs - occurrenceStart)) return candidate;
      return closest;
    },
    null
  );
  if (!best || Math.abs(best.startMs - occurrenceStart) > OCCURRENCE_MATCH_TOLERANCE_MS) return null;

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

import { print } from 'graphql';

import type {
  Debate,
  DebateMediaResponse,
  DebateTranscriptResponse,
  DebateTranscriptSegment,
} from '../../core/debates/api';
import { DEBATE_TRANSCRIPTS_PROPERTY_ID, DEBATE_TYPE_ID } from '../../core/debates/ontology';
import { groupTranscriptClaims } from '../../core/debates/transcript-claims';
import { type WarehouseTurn, warehouseClaims, warehouseTurns } from '../../core/debates/warehouse';
import { hexToUuid } from '../../core/id/create-id';
import { uuidToHex } from '../../core/id/normalize';
import {
  type DebateTranscriptClaimsQuery,
  debateTranscriptClaimsDocument,
  debateTranscriptClaimsVariables,
} from '../../core/io/debate-transcript-claims-document';
import { collectCursorPages } from '../../core/sync/collect-cursor-pages';

export type WarehouseSources = { graphUrl: string; chatUrl: string; fetch?: typeof fetch };
export type PublishedDebate = { id: string; transcripts: { spaceId: string }[] };

/** HTTP errors, GraphQL errors and malformed payloads abort the snapshot; only a real 404 is absent. */
async function json<T>(config: WarehouseSources, url: string, init?: RequestInit): Promise<T | null> {
  const response = await (config.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (response.status === 404 && !init) return null;
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid source response');
  return body as T;
}
async function graph<T>(config: WarehouseSources, query: string, variables: Record<string, unknown>): Promise<T> {
  const body = await json<{ data?: T; errors?: unknown[] }>(config, config.graphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!body?.data || body.errors?.length) throw new Error('Warehouse GraphQL read failed');
  return body.data;
}

export async function discoverDebates(config: WarehouseSources): Promise<PublishedDebate[]> {
  const debates = new Map<string, PublishedDebate>();
  const nodes = await collectCursorPages<PublishedDebate>(async after => {
    const data: {
      entitiesConnection: { nodes: PublishedDebate[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    } = await graph(
      config,
      `
      query WarehouseDebates($type: UUID!, $transcripts: UUID!, $after: Cursor, $relationsFirst: Int!) {
        entitiesConnection(first: 100, after: $after, typeId: $type, orderBy: [ID_ASC]) {
          nodes { id transcripts: relationsList(first: $relationsFirst, filter: { typeId: { is: $transcripts } }) { spaceId } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        type: DEBATE_TYPE_ID,
        transcripts: DEBATE_TRANSCRIPTS_PROPERTY_ID,
        after,
        relationsFirst: TRANSCRIPT_PAGE_LIMIT,
      }
    );
    const page = data.entitiesConnection;
    if (!Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== 'boolean')
      throw new Error('Invalid debate page');
    return { items: page.nodes, ...page.pageInfo };
  });
  for (const debate of nodes) {
    if (!Array.isArray(debate.transcripts) || debate.transcripts.length >= TRANSCRIPT_PAGE_LIMIT)
      throw new Error('Incomplete publication spaces');
    debates.set(uuidToHex(debate.id), debate);
  }
  if (debates.size === 0) throw new Error('Refusing to replace the warehouse with an empty debate catalog');
  return [...debates.values()];
}

// Bound every nested traversal explicitly; fail at the cap instead of publishing a truncated snapshot.
const TRANSCRIPT_PAGE_LIMIT = 1000;
const claimsQuery = print(debateTranscriptClaimsDocument);
function assertComplete(value: unknown): void {
  if (Array.isArray(value)) {
    if (value.length >= TRANSCRIPT_PAGE_LIMIT) throw new Error('Transcript traversal reached its page limit');
    value.forEach(assertComplete);
  } else if (value && typeof value === 'object') Object.values(value).forEach(assertComplete);
}

export async function readDebate(config: WarehouseSources, published: PublishedDebate) {
  const id = uuidToHex(published.id);
  const dashed = hexToUuid(id);
  const base = `${config.chatUrl.replace(/\/$/, '')}/debates/${dashed}`;
  const debate = await json<Debate>(config, base);
  const media = debate ? await json<DebateMediaResponse>(config, `${base}/media`) : null;
  const transcript = debate ? await json<DebateTranscriptResponse>(config, `${base}/transcript?format=json`) : null;
  if (
    debate &&
    (!Array.isArray(debate.participants) || !Array.isArray(debate.turn_durations_ms) || uuidToHex(debate.id) !== id)
  ) {
    throw new Error(`Invalid debate ${id}`);
  }
  if (
    media &&
    (!Array.isArray(media.artifacts) || (media.turn_segments !== undefined && !Array.isArray(media.turn_segments)))
  )
    throw new Error('Invalid media turns');
  if (transcript && !Array.isArray(transcript.segments)) throw new Error('Invalid transcript');
  const segments = transcript?.segments ?? [];
  for (const segment of segments) {
    if (
      typeof segment.text !== 'string' ||
      !Number.isSafeInteger(segment.start_ms) ||
      !Number.isSafeInteger(segment.end_ms) ||
      segment.start_ms < 0 ||
      segment.end_ms <= segment.start_ms
    )
      throw new Error('Invalid transcript segment');
  }
  const turns = debate ? warehouseTurns(debate, media?.turn_segments ?? []) : [];
  const claims = [];
  for (const space of new Set(published.transcripts.map(t => uuidToHex(t.spaceId)))) {
    const data = await graph<DebateTranscriptClaimsQuery>(
      config,
      claimsQuery,
      debateTranscriptClaimsVariables(id, space, TRANSCRIPT_PAGE_LIMIT)
    );
    if (!data.entity || !Array.isArray(data.entity.transcripts)) throw new Error(`Missing graph debate ${id}`);
    assertComplete(data);
    claims.push(...claimsFromGraph(data, id, space, segments, turns));
  }
  return {
    debate: {
      debate_id: id,
      status: !debate ? 'missing_service' : turns.length === 0 ? 'missing_timeline' : 'ready',
      turn_count: turns.length,
      claim_count: claims.length,
      unknown_claim_count: claims.filter(c => c.round === 'unknown').length,
    },
    turns,
    claims,
  };
}

/** Keep each (publication space, block, claim) occurrence, including claims reused across speakers. */
export function claimsFromGraph(
  data: DebateTranscriptClaimsQuery,
  id: string,
  space: string,
  segments: DebateTranscriptSegment[],
  turns: WarehouseTurn[]
) {
  const claims = [];
  const seenBlocks = new Set<string>();
  for (const transcript of data.entity?.transcripts ?? []) {
    if (!transcript?.toEntity) continue;
    for (const block of transcript.toEntity.blocks ?? []) {
      if (!block?.toEntity || seenBlocks.has(uuidToHex(block.toEntity.id))) continue;
      seenBlocks.add(uuidToHex(block.toEntity.id));
      const grouped = groupTranscriptClaims(
        { entity: { transcripts: [{ toEntity: { id: transcript.toEntity.id, blocks: [block] } }] } },
        space
      );
      claims.push(...warehouseClaims(id, space, grouped, segments, turns));
    }
  }
  return claims;
}

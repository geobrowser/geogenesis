import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { collectCursorPages } from '~/core/sync/collect-cursor-pages';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import { DEBATE_TYPE_ID } from './best-debates';
import { parseTimestampMs } from './ranking-ballot-recency';

/**
 * The debates side of the Best debates ranking screen (GEO-3678): which debates are new enough for
 * To rank, and which space each debate's ballot item is filed under.
 *
 * **The debate's own space.** A ballot item names a space, and `ranking_scores` is keyed by (block,
 * entity, space), so one debate filed under two spaces scores as two half-strength rows. The rule,
 * the same for every ballot and every ranker: the space whose Types relation makes the entity a
 * Debate. When a debate is typed in several spaces, the app's space ranking picks one, ties going to
 * the lowest space id (`getTopRankedSpaceId`), so the answer never depends on the order the API
 * returns rows in. A debate typed in no space has no own space and is left off the ballot.
 */

/** How far back To rank looks. Older debates drop off by themselves; there is no skip. */
export const TO_RANK_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const PAGE_SIZE = 1000;
/** Ids per spaces read, so a 2,000-debate ballot is a handful of requests, never one huge filter. */
const SPACE_LOOKUP_CHUNK = 200;
const SPACE_LOOKUP_CONCURRENCY = 4;

export type RecentDebate = {
  entityId: string;
  name: string | null;
  createdAtMs: number;
  /** The debate's own space under the rule above. */
  spaceId: string;
};

/** The debate's own space from the spaces it is typed a Debate in, or null when there are none. */
export function debateOwnSpaceId(typedSpaceIds: readonly string[]): string | null {
  const unique = [...new Set(typedSpaceIds.filter(Boolean).map(normId))];
  return getTopRankedSpaceId(unique);
}

type DebateTypeRow = { entityId: string; spaceId: string; name: string | null; createdAtMs: number };

/** Folds Types rows into one entry per debate, each with its own space. */
export function foldDebateTypeRows(rows: readonly DebateTypeRow[]): RecentDebate[] {
  const byEntity = new Map<string, { name: string | null; createdAtMs: number; spaces: string[] }>();
  for (const row of rows) {
    const key = normId(row.entityId);
    const existing = byEntity.get(key);
    if (existing) {
      existing.spaces.push(row.spaceId);
      existing.name = existing.name ?? row.name;
      existing.createdAtMs = Math.max(existing.createdAtMs, row.createdAtMs);
    } else {
      byEntity.set(key, { name: row.name, createdAtMs: row.createdAtMs, spaces: [row.spaceId] });
    }
  }
  const debates: RecentDebate[] = [];
  for (const [entityId, entry] of byEntity) {
    const spaceId = debateOwnSpaceId(entry.spaces);
    if (!spaceId) continue;
    debates.push({ entityId, name: entry.name, createdAtMs: entry.createdAtMs, spaceId });
  }
  return debates;
}

/**
 * To rank: the last 7 days' debates the ranker hasn't placed. Debates nobody has ranked come first,
 * to spread the team's work (goal: a ranker for every new debate within two days), then newest
 * first. "Rank the next one" takes the head of this list, so it follows the same order.
 *
 * `rankerCount` is the shared ballot reader's count; pass it only while that read is `ready`. Without
 * it the list is newest first, so it doesn't reshuffle while the read loads. A null count (unknown)
 * never counts as "nobody".
 *
 * `excludeEntityIds` is everything the ranker has already dealt with: their ranking (including
 * unpublished drags and placements), and whatever else the caller wants out of the queue, such as
 * the debates they pushed down (GEO-3679).
 */
export function selectToRank(
  debates: readonly RecentDebate[],
  excludeEntityIds: Iterable<string>,
  nowMs: number,
  {
    windowDays = TO_RANK_WINDOW_DAYS,
    rankerCount,
  }: { windowDays?: number; rankerCount?: (entityId: string) => number | null } = {}
): RecentDebate[] {
  const excluded = new Set([...excludeEntityIds].map(normId));
  const since = nowMs - windowDays * DAY_MS;
  const nobodyFirst = (debate: RecentDebate) => (rankerCount?.(debate.entityId) === 0 ? 0 : 1);
  return debates
    .filter(debate => debate.createdAtMs >= since && !excluded.has(normId(debate.entityId)))
    .sort(
      (a, b) => nobodyFirst(a) - nobodyFirst(b) || b.createdAtMs - a.createdAtMs || (a.entityId < b.entityId ? -1 : 1)
    );
}

// Hand-written, so codegen can't check them; ids are UUID columns and must be typed as such.
const RECENT_DEBATES_SOURCE = /* GraphQL */ `
  query BestDebatesRecentDebates($typesId: UUID!, $debateTypeId: UUID!, $since: String!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { is: $typesId }
        toEntityId: { is: $debateTypeId }
        fromEntity: { createdAt: { greaterThanOrEqualTo: $since } }
      }
    ) {
      nodes {
        fromEntityId
        spaceId
        fromEntity {
          name
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const MATCHING_DEBATES_SOURCE = /* GraphQL */ `
  query BestDebatesMatchingDebates(
    $typesId: UUID!
    $debateTypeId: UUID!
    $fromEntity: EntityFilter
    $first: Int!
    $after: Cursor
  ) {
    relationsConnection(
      first: $first
      after: $after
      filter: { typeId: { is: $typesId }, toEntityId: { is: $debateTypeId }, fromEntity: $fromEntity }
    ) {
      nodes {
        fromEntityId
        spaceId
        fromEntity {
          name
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const DEBATE_SPACES_SOURCE = /* GraphQL */ `
  query BestDebatesDebateSpaces($typesId: UUID!, $debateTypeId: UUID!, $ids: [UUID!]!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: { typeId: { is: $typesId }, toEntityId: { is: $debateTypeId }, fromEntityId: { in: $ids } }
    ) {
      nodes {
        fromEntityId
        spaceId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type TypeRowNode = {
  fromEntityId: string | null;
  spaceId: string | null;
  fromEntity?: { name: string | null; createdAt: string | null } | null;
};
type TypeRowsQuery = { relationsConnection: { nodes: Array<TypeRowNode | null>; pageInfo: PageInfo } | null };

const recentDebatesDocument = parse(RECENT_DEBATES_SOURCE) as TypedDocumentNode<
  TypeRowsQuery,
  { typesId: string; debateTypeId: string; since: string; first: number; after: string | null }
>;
const matchingDebatesDocument = parse(MATCHING_DEBATES_SOURCE) as TypedDocumentNode<
  TypeRowsQuery,
  {
    typesId: string;
    debateTypeId: string;
    fromEntity: Record<string, unknown> | null;
    first: number;
    after: string | null;
  }
>;
const debateSpacesDocument = parse(DEBATE_SPACES_SOURCE) as TypedDocumentNode<
  TypeRowsQuery,
  { typesId: string; debateTypeId: string; ids: string[]; first: number; after: string | null }
>;

function typeRowsPage(data: TypeRowsQuery) {
  const connection = data.relationsConnection;
  return {
    items: (connection?.nodes ?? []).flatMap((node): DebateTypeRow[] =>
      node?.fromEntityId && node.spaceId
        ? [
            {
              entityId: node.fromEntityId,
              spaceId: node.spaceId,
              name: node.fromEntity?.name?.trim() || null,
              createdAtMs: parseTimestampMs(node.fromEntity?.createdAt),
            },
          ]
        : []
    ),
    endCursor: connection?.pageInfo.endCursor ?? null,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
  };
}

/** One page of each read; injectable for tests. */
export type BestDebatesPageFetchers = {
  recent: (sinceSec: number, after: string | undefined) => Promise<ReturnType<typeof typeRowsPage>>;
  spaces: (entityIds: string[], after: string | undefined) => Promise<ReturnType<typeof typeRowsPage>>;
  /** Debates matching an entity filter (the team column's search and topics). */
  matching?: (
    fromEntity: Record<string, unknown> | null,
    after: string | undefined
  ) => Promise<ReturnType<typeof typeRowsPage>>;
};

const request = <TData, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVariables>,
  variables: TVariables
) => Effect.runPromise(graphql({ query: document, variables, decoder: data => data as TData }));

export const graphBestDebatesPageFetchers: BestDebatesPageFetchers = {
  recent: async (sinceSec, after) =>
    typeRowsPage(
      await request(recentDebatesDocument, {
        typesId: SystemIds.TYPES_PROPERTY,
        debateTypeId: DEBATE_TYPE_ID,
        since: String(sinceSec),
        first: PAGE_SIZE,
        after: after ?? null,
      })
    ),
  matching: async (fromEntity, after) =>
    typeRowsPage(
      await request(matchingDebatesDocument, {
        typesId: SystemIds.TYPES_PROPERTY,
        debateTypeId: DEBATE_TYPE_ID,
        fromEntity,
        first: PAGE_SIZE,
        after: after ?? null,
      })
    ),
  spaces: async (entityIds, after) =>
    typeRowsPage(
      await request(debateSpacesDocument, {
        typesId: SystemIds.TYPES_PROPERTY,
        debateTypeId: DEBATE_TYPE_ID,
        ids: entityIds,
        first: PAGE_SIZE,
        after: after ?? null,
      })
    ),
};

/** Every debate created in the window, each with its own space. */
export async function fetchRecentDebates(
  nowMs: number,
  fetchers: BestDebatesPageFetchers = graphBestDebatesPageFetchers,
  windowDays: number = TO_RANK_WINDOW_DAYS
): Promise<RecentDebate[]> {
  const sinceSec = Math.floor((nowMs - windowDays * DAY_MS) / 1000);
  const rows = await collectCursorPages(after => fetchers.recent(sinceSec, after));
  return foldDebateTypeRows(rows);
}

/**
 * The own space of each debate, keyed by normalized id; a debate with none is missing from the map.
 * Throws when a read fails, so a publish never goes out with spaces it only half knows.
 */
export async function fetchDebateOwnSpaces(
  entityIds: readonly string[],
  fetchers: BestDebatesPageFetchers = graphBestDebatesPageFetchers
): Promise<Map<string, string>> {
  const unique = [...new Set(entityIds.map(normId))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += SPACE_LOOKUP_CHUNK) chunks.push(unique.slice(i, i + SPACE_LOOKUP_CHUNK));

  const rows = (
    await mapWithConcurrency(chunks, SPACE_LOOKUP_CONCURRENCY, chunk =>
      collectCursorPages(after => fetchers.spaces(chunk, after))
    )
  ).flat();

  return new Map(foldDebateTypeRows(rows).map(debate => [debate.entityId, debate.spaceId]));
}

/** How many debates a filtered team list reads at most; past it the list says it shows the first. */
export const MATCHING_DEBATES_CAP = 1000;

/**
 * Every debate matching the team column's search and topics (Preston, 12 Nov): read in full,
 * cursor page after cursor page, so the list holds what the Topic menu counts rather than the pages
 * scrolled to. Capped at {@link MATCHING_DEBATES_CAP}; `capped` says the list stops short.
 */
export async function fetchMatchingDebates(
  fromEntity: Record<string, unknown> | null,
  fetchers: BestDebatesPageFetchers = graphBestDebatesPageFetchers,
  cap: number = MATCHING_DEBATES_CAP
): Promise<{ debates: RecentDebate[]; capped: boolean }> {
  const matching = fetchers.matching;
  if (!matching) return { debates: [], capped: false };
  const rows: DebateTypeRow[] = [];
  let after: string | undefined;
  let capped = false;
  const seen = new Set<string>();
  while (true) {
    const page = await matching(fromEntity, after);
    rows.push(...page.items);
    for (const row of page.items) seen.add(normId(row.entityId));
    if (!page.hasNextPage) break;
    if (seen.size >= cap) {
      capped = true;
      break;
    }
    if (!page.endCursor || page.endCursor === after) throw new Error('Matching debates: cursor did not advance');
    after = page.endCursor;
  }
  const debates = foldDebateTypeRows(rows);
  return { debates: debates.slice(0, cap), capped: capped || debates.length > cap };
}

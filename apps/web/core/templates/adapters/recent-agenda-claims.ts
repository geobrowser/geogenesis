'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_AGENDA_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';

/**
 * GEO-3873. A claim listed on any Debate agenda in this many days leads a Topic page's Claims list,
 * whatever its Best rank. Counted from the agenda's createdAt: Arturas publishes each agenda on its day.
 */
export const AGENDA_PIN_DAYS = 21;

const PAGE_SIZE = 1_000;
const DAY_SECONDS = 86_400;

/** One claim listed on a Debate agenda in the window. */
export type RecentAgendaClaim = {
  /** Hex id. */
  id: string;
  name: string;
  /** The spaces the claim lives in, hex. */
  spaceIds: string[];
  /** The spaces that tagged it with each topic: topic hex id -> space hex ids. */
  topicSpaces: Map<string, Set<string>>;
  /** Unix seconds of the newest agenda that listed it. */
  listedAt: number;
};

const AGENDAS_QUERY = parse(/* GraphQL */ `
  query RecentDebateAgendas($agendaTypeId: UUID!, $since: String!, $blocksTypeId: UUID!, $first: Int!) {
    entitiesConnection(first: $first, typeId: $agendaTypeId, filter: { createdAt: { greaterThanOrEqualTo: $since } }) {
      nodes {
        id
        createdAt
        relationsList(filter: { typeId: { is: $blocksTypeId } }) {
          toEntityId
        }
      }
    }
  }
`) as TypedDocumentNode<
  {
    entitiesConnection?: {
      nodes?: Array<{
        id: string;
        createdAt: string;
        relationsList?: Array<{ toEntityId: string } | null> | null;
      } | null> | null;
    } | null;
  },
  { agendaTypeId: string; since: string; blocksTypeId: string; first: number }
>;

// Versions, not current relations: a claim taken off an agenda once it has enough debates still counts.
const LISTING_VERSIONS_QUERY = parse(/* GraphQL */ `
  query AgendaListingVersions($blockIds: [UUID!]!, $itemTypeId: UUID!, $first: Int!, $after: Cursor) {
    relationVersionsConnection(
      first: $first
      after: $after
      filter: { fromEntityId: { in: $blockIds }, typeId: { is: $itemTypeId } }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        fromEntityId
        toEntityId
      }
    }
  }
`) as TypedDocumentNode<
  {
    relationVersionsConnection?: {
      pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
      nodes?: Array<{ fromEntityId: string; toEntityId: string } | null> | null;
    } | null;
  },
  { blockIds: string[]; itemTypeId: string; first: number; after?: string }
>;

// Claims only: "All spaces" agendas list debates, which never lead a Claims list.
const LISTED_CLAIMS_QUERY = parse(/* GraphQL */ `
  query AgendaListedClaims($ids: [UUID!]!, $claimTypeId: UUID!, $topicsPropertyId: UUID!, $first: Int!) {
    entitiesConnection(first: $first, filter: { id: { in: $ids }, typeIds: { anyEqualTo: $claimTypeId } }) {
      nodes {
        id
        name
        spaceIds
        relationsList(filter: { typeId: { is: $topicsPropertyId } }) {
          toEntityId
          spaceId
        }
      }
    }
  }
`) as TypedDocumentNode<
  {
    entitiesConnection?: {
      nodes?: Array<{
        id: string;
        name?: string | null;
        spaceIds?: string[] | null;
        relationsList?: Array<{ toEntityId: string; spaceId: string } | null> | null;
      } | null> | null;
    } | null;
  },
  { ids: string[]; claimTypeId: string; topicsPropertyId: string; first: number }
>;

type Agenda = { id: string; createdAt: number; blockIds: string[] };
type Listing = { blockId: string; itemId: string };
type ListedEntity = {
  id: string;
  name: string;
  spaceIds: string[];
  topics: { topicId: string; spaceId: string }[];
};

export type AgendaClaimsIo = {
  agendas: (since: number, signal?: AbortSignal) => Promise<Agenda[]>;
  listings: (blockIds: string[], after: string | undefined, signal?: AbortSignal) => Promise<CursorPage<Listing>>;
  claims: (ids: string[], signal?: AbortSignal) => Promise<ListedEntity[]>;
};

const liveIo: AgendaClaimsIo = {
  agendas: (since, signal) =>
    Effect.runPromise(
      graphql({
        query: AGENDAS_QUERY,
        variables: {
          agendaTypeId: DEBATE_AGENDA_TYPE_ID,
          since: String(since),
          blocksTypeId: ID.uuidToHex(SystemIds.BLOCKS),
          first: PAGE_SIZE,
        },
        decoder: data =>
          (data.entitiesConnection?.nodes ?? []).flatMap(node =>
            node
              ? [
                  {
                    id: node.id,
                    createdAt: Number(node.createdAt),
                    blockIds: (node.relationsList ?? []).flatMap(rel => (rel ? [rel.toEntityId] : [])),
                  },
                ]
              : []
          ),
        signal,
      })
    ),
  listings: (blockIds, after, signal) =>
    Effect.runPromise(
      graphql({
        query: LISTING_VERSIONS_QUERY,
        variables: {
          blockIds,
          itemTypeId: ID.uuidToHex(SystemIds.COLLECTION_ITEM_RELATION_TYPE),
          first: PAGE_SIZE,
          after,
        },
        decoder: (data): CursorPage<Listing> => ({
          items: (data.relationVersionsConnection?.nodes ?? []).flatMap(node =>
            node ? [{ blockId: node.fromEntityId, itemId: node.toEntityId }] : []
          ),
          endCursor: data.relationVersionsConnection?.pageInfo?.endCursor ?? null,
          hasNextPage: data.relationVersionsConnection?.pageInfo?.hasNextPage ?? false,
        }),
        signal,
      })
    ),
  claims: (ids, signal) =>
    Effect.runPromise(
      graphql({
        query: LISTED_CLAIMS_QUERY,
        variables: {
          ids,
          claimTypeId: CLAIM_TYPE_ID,
          topicsPropertyId: TOPICS_PROPERTY_ID,
          first: PAGE_SIZE,
        },
        decoder: data =>
          (data.entitiesConnection?.nodes ?? []).flatMap(node =>
            node?.name?.trim()
              ? [
                  {
                    id: node.id,
                    name: node.name,
                    spaceIds: node.spaceIds ?? [],
                    topics: (node.relationsList ?? []).flatMap(rel =>
                      rel ? [{ topicId: rel.toEntityId, spaceId: rel.spaceId }] : []
                    ),
                  },
                ]
              : []
          ),
        signal,
      })
    ),
};

/**
 * Every claim listed on any Debate agenda created in the last {@link AGENDA_PIN_DAYS} days, with the
 * newest such listing, including claims since taken off their agenda. Three requests whatever the
 * number of claims, and the answer covers every Topic page.
 */
export async function fetchRecentAgendaClaims({
  nowMs = Date.now(),
  signal,
  io = liveIo,
}: { nowMs?: number; signal?: AbortSignal; io?: AgendaClaimsIo } = {}): Promise<RecentAgendaClaim[]> {
  const since = Math.floor(nowMs / 1000) - AGENDA_PIN_DAYS * DAY_SECONDS;
  const agendas = await io.agendas(since, signal);

  const blockListedAt = new Map<string, number>();
  for (const agenda of agendas) {
    if (!Number.isFinite(agenda.createdAt) || agenda.createdAt < since) continue;
    for (const blockId of agenda.blockIds) {
      const hex = ID.uuidToHex(blockId);
      blockListedAt.set(hex, Math.max(blockListedAt.get(hex) ?? 0, agenda.createdAt));
    }
  }
  if (blockListedAt.size === 0) return [];

  const blockIds = [...blockListedAt.keys()];
  const listings = await collectCursorPages(after => io.listings(blockIds, after, signal));
  const itemListedAt = new Map<string, number>();
  for (const listing of listings) {
    const listedAt = blockListedAt.get(ID.uuidToHex(listing.blockId));
    if (listedAt === undefined) continue;
    const hex = ID.uuidToHex(listing.itemId);
    itemListedAt.set(hex, Math.max(itemListedAt.get(hex) ?? 0, listedAt));
  }
  if (itemListedAt.size === 0) return [];

  const claims = await io.claims([...itemListedAt.keys()], signal);
  return claims.flatMap(claim => {
    const id = ID.uuidToHex(claim.id);
    const listedAt = itemListedAt.get(id);
    if (listedAt === undefined) return [];
    const topicSpaces = new Map<string, Set<string>>();
    for (const { topicId, spaceId } of claim.topics) {
      const topicHex = ID.uuidToHex(topicId);
      const spaces = topicSpaces.get(topicHex) ?? new Set<string>();
      spaces.add(ID.uuidToHex(spaceId));
      topicSpaces.set(topicHex, spaces);
    }
    return [{ id, name: claim.name, spaceIds: claim.spaceIds.map(s => ID.uuidToHex(s)), topicSpaces, listedAt }];
  });
}

/** The recent agenda claims, read once for every Topic page. */
export function useRecentAgendaClaims() {
  return useQuery({
    queryKey: ['recent-agenda-claims', AGENDA_PIN_DAYS],
    queryFn: ({ signal }) => fetchRecentAgendaClaims({ signal }),
    staleTime: 60_000,
  });
}

/**
 * The agenda claims a Topic page shows: the ones the page's space itself tagged with the topic, the
 * same space rule the page's other claims follow.
 */
export function agendaClaimsForTopic(
  claims: readonly RecentAgendaClaim[],
  topicId: string,
  spaceId: string
): RecentAgendaClaim[] {
  const topicHex = ID.uuidToHex(topicId);
  const spaceHex = ID.uuidToHex(spaceId);
  return claims.filter(claim => claim.topicSpaces.get(topicHex)?.has(spaceHex));
}

/**
 * Puts the agenda claims first (GEO-3873): those Best ranks in Best's order, then those it does not,
 * newest agenda first, then every other seed in its existing order. Agenda claims the seeds lack are
 * added from `makeSeed`. No id appears twice.
 */
export function pinAgendaClaims<Seed extends { id: string }>({
  seeds,
  agendaClaims,
  bestIds,
  makeSeed,
}: {
  seeds: readonly Seed[];
  agendaClaims: readonly RecentAgendaClaim[];
  /** The Best feed's ids, in Best order. */
  bestIds: readonly string[];
  makeSeed: (claim: RecentAgendaClaim) => Seed;
}): Seed[] {
  if (agendaClaims.length === 0) return [...seeds];

  const bestRank = new Map<string, number>();
  bestIds.forEach((id, index) => {
    const hex = ID.uuidToHex(id);
    if (!bestRank.has(hex)) bestRank.set(hex, index);
  });
  const seedByHex = new Map<string, Seed>();
  for (const seed of seeds) {
    const hex = ID.uuidToHex(seed.id);
    if (!seedByHex.has(hex)) seedByHex.set(hex, seed);
  }

  const agendaByHex = new Map<string, RecentAgendaClaim>();
  for (const claim of agendaClaims) {
    const hex = ID.uuidToHex(claim.id);
    const held = agendaByHex.get(hex);
    if (!held || claim.listedAt > held.listedAt) agendaByHex.set(hex, claim);
  }
  const pinned = [...agendaByHex.entries()].sort(([aHex, a], [bHex, b]) => {
    const aRank = bestRank.get(aHex) ?? Number.POSITIVE_INFINITY;
    const bRank = bestRank.get(bHex) ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    if (a.listedAt !== b.listedAt) return b.listedAt - a.listedAt;
    return a.name.localeCompare(b.name);
  });

  const seen = new Set<string>();
  const out: Seed[] = [];
  for (const [hex, claim] of pinned) {
    seen.add(hex);
    out.push(seedByHex.get(hex) ?? makeSeed(claim));
  }
  for (const seed of seeds) {
    const hex = ID.uuidToHex(seed.id);
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(seed);
  }
  return out;
}

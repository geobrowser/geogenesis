'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

/**
 * Every claim this person holds a position on, with the two things the filters
 * narrow by (GEO-2918).
 *
 * **The whole set, not a page.** This is what lets the menus mean something: a
 * facet built from the pages currently on screen describes the scroll position
 * rather than the record, so the options change under the reader as they scroll
 * and a count next to a topic is a count of nothing in particular. Filtering
 * against a complete index is exact; filtering against a partial one is the bug
 * this file exists to avoid.
 *
 * It is affordable because it is narrow and because the sets are small: two
 * columns and a relation list, 208 claims on the reference account and 190 on
 * the busiest voter in the graph — one request at `first: 500`. `POSITION_INDEX_MAX_PAGES`
 * bounds a pathological record rather than the ordinary one.
 *
 * `votedBy` does the work, from GEO-2913. Without it this would be the vote ids
 * first and then an `id: { in: … }` lookup, which is the two-step the count used
 * to do.
 */
const POSITION_INDEX_SOURCE = /* GraphQL */ `
  query PersonPositionIndex($userId: UUID!, $topicsPropertyId: UUID!, $first: Int, $after: Cursor) {
    entitiesConnection(votedBy: $userId, votedByKinds: [1, 2], first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        spaceIds
        relationsList(first: 50, filter: { typeId: { is: $topicsPropertyId } }) {
          spaceId
          toEntity {
            id
            name
          }
        }
      }
    }
  }
`;

export const personPositionIndexDocument = parse(POSITION_INDEX_SOURCE) as TypedDocumentNode<any, any>;

const INDEX_PAGE_SIZE = 500;

/**
 * Bounds the request count. Reaching it is an error, not a smaller answer.
 *
 * 20 pages is 10,000 claims against 208 on the busiest account, so this is a
 * guard rather than a limit. It throws because a *truncated* index is worse than
 * none: the menus would offer the topics of the first 10,000 claims and report
 * "no matches" for anything beyond them, while the rail beside it counts the
 * whole record. The proposal-facet query takes the same line for the same
 * reason, and so does the order fetch.
 */
const POSITION_INDEX_MAX_PAGES = 20;

/**
 * One claim, reduced to what the control row narrows by.
 *
 * **Topics are held per space, not pooled.** The graph records a topic as a
 * relation written *in* a space, so the same claim carries different topics in
 * different spaces — `claimTopicsById` in the debates hub says the same thing
 * and keeps the space for the same reason. Every multi-space claim on both
 * reference accounts has its topics in exactly one of its spaces: 9 of 9, and 13
 * of 15. Pooling them let a Space-A + Topic-T filter match a claim whose T was
 * only ever assigned in Space B, and then rendered the card in A where the topic
 * it was filtered by does not exist.
 */
export type PositionIndexEntry = {
  /** Normalised, because every caller arrives holding an id spelled the other way. */
  entityId: string;
  spaceIds: string[];
  /** Every topic on the claim, in any space. What the unfiltered topic menu lists. */
  topicIds: string[];
  /** Topics by the space their relation was written in. */
  topicsBySpace: Map<string, Set<string>>;
};

export type PositionFacet = {
  id: string;
  name: string | null;
  /** How many of this person's claims carry it. */
  count: number;
};

export type PersonPositionIndex = {
  entries: PositionIndexEntry[];
  /** Topics across the whole record, most-used first. */
  topics: PositionFacet[];
  /** Spaces across the whole record, most-used first. Named by the caller. */
  spaces: PositionFacet[];
};

export const EMPTY_POSITION_INDEX: PersonPositionIndex = {
  entries: [],
  topics: [],
  spaces: [],
};

type IndexNode = {
  id?: string | null;
  spaceIds?: (string | null)[] | null;
  relationsList?:
    ({ spaceId?: string | null; toEntity?: { id?: string | null; name?: string | null } | null } | null)[] | null;
};

type IndexResponse = {
  entitiesConnection?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?: (IndexNode | null)[] | null;
  } | null;
};

function decodePage(response: IndexResponse): IndexPage {
  const connection = response.entitiesConnection;
  const entries: PositionIndexEntry[] = [];

  for (const node of connection?.nodes ?? []) {
    if (!node?.id) continue;

    const topicIds: string[] = [];
    const seenTopic = new Set<string>();
    const topicsBySpace = new Map<string, Set<string>>();

    for (const relation of node.relationsList ?? []) {
      const topic = relation?.toEntity;
      if (!topic?.id) continue;
      const key = normId(topic.id);

      // A claim can carry the same topic written in two spaces. One entry each
      // would double it in the facet count and make a menu row read as more of
      // the record than it is.
      if (!seenTopic.has(key)) {
        seenTopic.add(key);
        topicIds.push(key);
      }

      const spaceId = relation?.spaceId ? normId(relation.spaceId) : null;
      if (!spaceId) continue;
      const inSpace = topicsBySpace.get(spaceId);
      if (inSpace) inSpace.add(key);
      else topicsBySpace.set(spaceId, new Set([key]));
    }

    entries.push({
      entityId: normId(node.id),
      spaceIds: (node.spaceIds ?? []).filter((id): id is string => Boolean(id)).map(normId),
      topicIds,
      topicsBySpace,
    });
  }

  return {
    entries,
    names: collectNames(connection?.nodes ?? []),
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
    endCursor: connection?.pageInfo?.endCursor ?? null,
  };
}

type IndexPage = {
  entries: PositionIndexEntry[];
  names: Map<string, string | null>;
  hasNextPage: boolean;
  endCursor: string | null;
};

function collectNames(nodes: (IndexNode | null)[]) {
  const names = new Map<string, string | null>();

  for (const node of nodes) {
    for (const relation of node?.relationsList ?? []) {
      const topic = relation?.toEntity;
      if (!topic?.id) continue;
      const key = normId(topic.id);
      // First non-null wins: the same topic is named in several spaces and one
      // of them may carry it unnamed.
      if (names.get(key) == null) names.set(key, topic.name ?? null);
    }
  }

  return names;
}

/**
 * Facets ordered by how much of the record they account for.
 *
 * Count first, then name, then id — the same shape as every other ordered list
 * on this page, and stable where counts tie so the menu does not reshuffle
 * between renders.
 */
export function facetsFrom(
  entries: readonly PositionIndexEntry[],
  pick: (entry: PositionIndexEntry) => readonly string[],
  names: Map<string, string | null>
): PositionFacet[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const id of pick(entry)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: names.get(id) ?? null, count }))
    .sort((a, b) => b.count - a.count || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id));
}

/**
 * Which claims survive the current selection.
 *
 * **Spaces are OR and topics are AND**, matching the debates hub exactly — see
 * `HubMultiFilterMenu`, which documents why the two dimensions differ. Picking
 * two spaces asks for either; picking two topics asks for a claim carrying both.
 *
 * And the two have to be satisfied **by the same space**, which is the part that
 * is not obvious. A topic belongs to the space its relation was written in, so a
 * claim living in A and B with its topics only in B does not become a Space-A
 * claim about those topics. Asking the two dimensions separately said it did.
 */
export function matchingEntityIds(
  index: PersonPositionIndex,
  selection: { spaceIds: readonly string[]; topicIds: readonly string[] }
): string[] {
  return index.entries.filter(entry => satisfyingSpace(entry, selection) !== null).map(entry => entry.entityId);
}

/**
 * A space of this claim's that satisfies the whole selection, or null.
 *
 * Doubles as the answer to "where should this card be shown", which is why
 * `preferredSpacesFor` reads it rather than repeating the rule: the space the
 * claim matched *in* is the only one where what the reader filtered by is true.
 *
 * With no space picked, any of the claim's spaces may satisfy the topics; the
 * reader asked about topics, not about where they were written. With no topics
 * picked, any picked space the claim is in will do.
 */
export function satisfyingSpace(
  entry: PositionIndexEntry,
  selection: { spaceIds: readonly string[]; topicIds: readonly string[] }
): string | null {
  const picked = selection.spaceIds.map(normId);
  const topics = selection.topicIds.map(normId);
  const candidates = picked.length > 0 ? entry.spaceIds.filter(id => picked.includes(id)) : entry.spaceIds;

  if (candidates.length === 0) return null;
  if (topics.length === 0) {
    // In the reader's order where they picked, so a second pick does not move
    // where the first one's claims appear.
    return picked.length > 0 ? (picked.find(id => candidates.includes(id)) ?? null) : candidates[0];
  }

  const ordered = picked.length > 0 ? picked.filter(id => candidates.includes(id)) : candidates;

  return ordered.find(spaceId => topics.every(topic => entry.topicsBySpace.get(spaceId)?.has(topic))) ?? null;
}

/**
 * The facet counts, given what is already picked.
 *
 * Each option answers "how many claims would I be left with if I ticked this",
 * which is the only reading under which a zero is useful. Without it a topic
 * menu of 349 rows is a minefield: claims carry 5.2 topics on average but only
 * 19 of the 66 pairs among the twelve commonest ever co-occur, so most second
 * picks empty the list and nothing on screen said so in advance.
 *
 * **The two dimensions narrow differently, and the asymmetry is the hub's** —
 * see `HubMultiFilterMenu`, which states the rule for the same pair of menus.
 * Spaces are OR, so the space menu is narrowed by the topics and never by
 * itself: ticking a second space can only add, so its own siblings' counts must
 * not assume the first. Topics are AND, so a topic's count is taken over the
 * claims already surviving every filter, its own siblings included.
 *
 * Computed here rather than asked for, because the index is the whole record.
 * The hub needs a server round trip for this; a complete set in hand does not.
 */
export function narrowedFacets(
  index: PersonPositionIndex,
  selection: { spaceIds: readonly string[]; topicIds: readonly string[] }
): { spaces: PositionFacet[]; topics: PositionFacet[] } {
  const names = new Map(index.topics.map(topic => [topic.id, topic.name]));

  const topicsOnly = index.entries.filter(
    entry => satisfyingSpace(entry, { spaceIds: [], topicIds: selection.topicIds }) !== null
  );
  const everything = index.entries.filter(entry => satisfyingSpace(entry, selection) !== null);

  return {
    spaces: withZeroes(
      index.spaces,
      facetsFrom(topicsOnly, entry => entry.spaceIds, new Map())
    ),
    // Counted over the topics *of the space each claim matched in*, not over its
    // pooled ones — otherwise ticking a space leaves the topic menu offering
    // topics that belong to the claim's other space and lead nowhere.
    topics: withZeroes(
      index.topics,
      facetsFrom(everything, entry => topicsIn(entry, selection), names)
    ),
  };
}

/** The topics of this claim that count, given where the reader is looking. */
function topicsIn(
  entry: PositionIndexEntry,
  selection: { spaceIds: readonly string[]; topicIds: readonly string[] }
): readonly string[] {
  if (selection.spaceIds.length === 0) return entry.topicIds;

  const picked = selection.spaceIds.map(normId);
  const seen = new Set<string>();

  for (const spaceId of entry.spaceIds) {
    if (!picked.includes(spaceId)) continue;
    for (const topic of entry.topicsBySpace.get(spaceId) ?? []) seen.add(topic);
  }

  return [...seen];
}

/**
 * Every option the record has, in the record's order, carrying its narrowed count.
 *
 * Options are not dropped when they fall to zero. A menu that removes rows as
 * you tick them reorders under the cursor and hides the fact that a pick led
 * nowhere — and the row you just selected would be the first to vanish.
 */
function withZeroes(all: readonly PositionFacet[], narrowed: readonly PositionFacet[]): PositionFacet[] {
  const counts = new Map(narrowed.map(facet => [facet.id, facet.count]));

  return all.map(facet => ({ ...facet, count: counts.get(facet.id) ?? 0 }));
}

/**
 * Which space to show a claim in, when the reader has narrowed to some.
 *
 * 4% of the reference account's claims live in more than one space, and 7% of
 * the busiest voter's. `pickDisplaySpaceId` takes the *first* of an entity's
 * spaces by default, so without this, filtering to Space A renders those claims
 * labelled and linked to Space B — the card contradicting the control that
 * produced it.
 *
 * Only meaningful under a selection. With no filter there is no space the reader
 * asked for, so there is nothing to prefer and the default stands.
 *
 * The same mechanism Debates has used since `preferredSpaceById` was added for
 * it: a side relation names the space its debate lives in. This is the other
 * caller, and it went without one until the space filter gave it an answer.
 */
export function preferredSpacesFor(
  index: PersonPositionIndex,
  selection: { spaceIds: readonly string[]; topicIds?: readonly string[] }
): Map<string, string> {
  const preferred = new Map<string, string>();
  const topicIds = selection.topicIds ?? [];
  if (selection.spaceIds.length === 0 && topicIds.length === 0) return preferred;

  for (const entry of index.entries) {
    // The space the claim *matched in*, from the same rule that decided it
    // matched. Choosing the space independently could put the card in one where
    // the topic the reader filtered by was never assigned.
    const match = satisfyingSpace(entry, { spaceIds: selection.spaceIds, topicIds });
    if (match) preferred.set(entry.entityId, match);
  }

  return preferred;
}

export function personPositionIndexQueryKey(spaceId: string) {
  return ['person-position-index', ID.uuidToHex(spaceId)] as const;
}

export function usePersonPositionIndex({ spaceId, enabled = true }: { spaceId: string; enabled?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: personPositionIndexQueryKey(spaceId),
    enabled: enabled && spaceId !== '',
    // Held longer than the list. The record's shape changes when this person
    // votes, which is not something the reader of somebody else's profile does.
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<PersonPositionIndex> => {
      const entries: PositionIndexEntry[] = [];
      const names = new Map<string, string | null>();
      let after: string | null = null;
      let pages = 0;

      for (;;) {
        const page: IndexPage = await Effect.runPromise(
          graphql({
            query: personPositionIndexDocument,
            decoder: decodePage,
            variables: {
              userId: ID.uuidToHex(spaceId),
              topicsPropertyId: TOPICS_PROPERTY_ID,
              first: INDEX_PAGE_SIZE,
              after,
            },
            signal,
          })
        );

        entries.push(...page.entries);
        for (const [id, name] of page.names) {
          if (names.get(id) == null) names.set(id, name);
        }

        pages += 1;
        if (!page.hasNextPage || !page.endCursor) break;
        if (pages >= POSITION_INDEX_MAX_PAGES) {
          throw new Error(`[position-index] ${spaceId} exceeds ${POSITION_INDEX_MAX_PAGES} pages`);
        }
        after = page.endCursor;
      }

      return {
        entries,
        topics: facetsFrom(entries, entry => entry.topicIds, names),
        // Spaces are counted here and named by the caller, which already looks
        // space names up for the rows and would otherwise ask twice.
        spaces: facetsFrom(entries, entry => entry.spaceIds, new Map()),
      };
    },
  });

  return { index: data ?? EMPTY_POSITION_INDEX, isLoading, isError };
}

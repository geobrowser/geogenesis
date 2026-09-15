'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { COVERAGE_TYPE_IDS } from '../ontology';

/**
 * How many claims, debates and coverage items a topic holds, for the counts beside its tab labels.
 *
 * This is the composition bar's query, narrowed (GEO-2910). The bar drew five buckets and is gone;
 * three of them are worth keeping because a count beside a tab is also the control that opens what
 * it counts. What did *not* survive is `total` and its remainder: "other" was total minus the named
 * buckets, so it grew whenever the space scope excluded something — a number that went up as the
 * page showed less.
 *
 * Deliberately not free. The sections themselves are paged and return no totals, so a count has to
 * be asked for; one request with three aliased counts is what that costs, measured at ~0.35s for a
 * topic with 376 links. Anyone tempted to derive these from the lists instead should know that the
 * lists are a page each — 4 claims, 8 coverage rows — and would report those numbers.
 *
 * Coverage is one bucket over every {@link COVERAGE_TYPE_IDS}, matching what `useTopicCoverage`
 * lists, rather than the separate episode/news/tweet/post counts the bar drew. The tab shows one
 * list, so it gets one number.
 *
 * Debates are the one bucket that is not a `Topics` relation. A Debate carries `Claims` and never
 * `Topics`, so the link is two hops — debate to claim, claim to topic — expressed as a nested
 * filter on the far end. Asked of *entities* rather than relations because the count has to be of
 * debates, not of links: one debate arguing three of a topic's claims is three `Claims` relations
 * and would treble it. This is also why the number can exceed what the Debates tab can show, which
 * reaches through the newest `CLAIMS_CONSIDERED` claims only.
 */
const TOPIC_TAB_COUNTS_SOURCE = /* GraphQL */ `
  query TopicTabCounts(
    $topicsPropertyId: UUID!
    $topicId: UUID!
    $claim: [UUID!]
    $coverage: [UUID!]
    $debate: [UUID!]
    $debateClaimsPropertyId: UUID!
    $spaceIds: [UUID!]
  ) {
    claims: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $claim }, spaceIds: { overlaps: $spaceIds } }
      }
    ) {
      totalCount
    }
    coverage: relationsConnection(
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $coverage }, spaceIds: { overlaps: $spaceIds } }
      }
    ) {
      totalCount
    }
    debates: entitiesConnection(
      filter: {
        typeIds: { overlaps: $debate }
        spaceIds: { overlaps: $spaceIds }
        relations: {
          some: {
            typeId: { is: $debateClaimsPropertyId }
            toEntity: { relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId } } } }
          }
        }
      }
    ) {
      totalCount
    }
  }
`;

export const topicTabCountsDocument = parse(TOPIC_TAB_COUNTS_SOURCE) as TypedDocumentNode<any, any>;

type CountsResponse = Record<string, { totalCount?: number | null } | null | undefined>;

export type TopicTabCounts = {
  claims: number;
  debates: number;
  coverage: number;
};

function readCount(data: CountsResponse | undefined, key: string): number {
  const value = data?.[key]?.totalCount;
  return typeof value === 'number' ? value : 0;
}

/**
 * The counts, and whether they are safe to draw yet.
 *
 * `isReady` is false until the scope has resolved *and* the request has answered, because
 * `useTopicSpaceScope` returns `undefined` while its allowlist is still being assembled and
 * `undefined` means "no filter" on the wire, not "nothing". A count issued in that beat is the
 * graph-wide number — 470 where the viewer's scope holds nine — and it would then step down in
 * front of the reader. The tab renders without its count until this is true.
 *
 * That is the same rule the lists follow. `useTopicLinkedEntities` holds a page until its ranking
 * is known rather than showing one order and resequencing it, for the same reason: a number or an
 * order that corrects itself is worse than one that arrives a beat late.
 */
export function useTopicTabCounts(
  topicId: string,
  spaceIds: string[] | undefined
): { counts: TopicTabCounts; isReady: boolean } {
  const scopeResolved = spaceIds !== undefined;

  const { data, isPending } = useQuery({
    queryKey: ['topic', 'tab-counts', ID.uuidToHex(topicId), spaceIds ?? null],
    enabled: scopeResolved,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicTabCountsDocument,
          decoder: (response: CountsResponse) => ({
            claims: readCount(response, 'claims'),
            debates: readCount(response, 'debates'),
            coverage: readCount(response, 'coverage'),
          }),
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            claim: [ID.uuidToHex(CLAIM_TYPE_ID)],
            coverage: COVERAGE_TYPE_IDS.map(id => ID.uuidToHex(id)),
            debate: [ID.uuidToHex(DEBATE_TYPE_ID)],
            debateClaimsPropertyId: ID.uuidToHex(DEBATE_CLAIMS_PROPERTY_ID),
            spaceIds,
          },
          signal,
        })
      ),
  });

  return {
    counts: {
      claims: data?.claims ?? 0,
      debates: data?.debates ?? 0,
      coverage: data?.coverage ?? 0,
    },
    // `data` rather than `!isPending`: a disabled query is "pending" forever, so keying off the
    // flag alone would report ready before the scope had even let the request run.
    isReady: scopeResolved && !isPending && data !== undefined,
  };
}

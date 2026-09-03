import { TAG_PROPERTY_ID } from '~/core/constants';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from './ontology';

/**
 * What "related" means for a claim, in one place: another claim in the same space carrying at
 * least one of this claim's topics.
 *
 * Two surfaces ask the question — the gallery at the foot of a claim page, and the Related claims
 * source in the debate-again picker (GEO-2758) — and a reader who sees a claim in one and not the
 * other has no way to tell which is lying. The relation is a curator's, so the answer has to come
 * from the same clause rather than from two hand-written notions of similarity that agree until
 * one of them is edited.
 *
 * Deliberately not a similarity score. Topics are assigned in the knowledge graph, and reusing
 * that assignment is the whole point: it keeps "related" something a curator decides rather than
 * something each caller infers.
 *
 * The claim itself matches this clause — it carries its own topics — so it comes back in its own
 * related list, and as the *only* row when it has no neighbours. Every caller must drop it, and
 * before drawing any conclusion from how many rows came back: the picker counts them to decide
 * whether to offer Related claims at all, so counting the claim itself makes "no neighbours" look
 * like "one neighbour" (GEO-2758).
 *
 * Left to the caller rather than folded in here because the clause is also the shape the two
 * surfaces are compared on, and because neither caller can pass an id the other would want
 * excluded — the page has `claimId`, the picker has the source debate's.
 *
 * `topicIds` empty means there is nothing to be related *by*, and the clause would otherwise match
 * no relation at all and quietly return the space's entire claim list. Callers must not run the
 * query in that case; both gate on it.
 */
export function relatedClaimsWhere({
  spaceId,
  topicIds,
  requireTagId,
}: {
  spaceId: string;
  topicIds: string[];
  /**
   * Narrow further to claims carrying a `Tags` relation to this tag.
   *
   * The one place the two surfaces deliberately differ, and it is a difference in *purpose* rather
   * than in what "related" means: the picker is asking which claim this pair should debate next,
   * so it wants only the ones a curator has marked for debating. The claim page's gallery is a way
   * out of the page and takes the whole relation.
   *
   * Passed rather than hard-coded here so the divergence is visible at the call site — a reader of
   * the picker can see that its list is narrower without having to know this module's internals.
   */
  requireTagId?: string;
}): WhereCondition {
  return {
    types: [{ id: { equals: CLAIM_TYPE_ID } }],
    spaces: [{ equals: spaceId }],
    relations: [
      { typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { in: topicIds } } },
      // Two relation conditions are ANDed, each satisfied by *some* relation — checked against
      // both the local matcher (`matchesRelations`: `conditions.every(... relations.some(...))`)
      // and the GraphQL converter (`filter.and` of `relations: { some }`), which agree. A `values`
      // array does *not* agree across those two, so this is worth stating rather than assuming.
      ...(requireTagId
        ? [{ typeOf: { id: { equals: TAG_PROPERTY_ID } }, toEntity: { id: { in: [requireTagId] } } }]
        : []),
    ],
  };
}

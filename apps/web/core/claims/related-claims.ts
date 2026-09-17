import { TAG_PROPERTY_ID } from '~/core/constants';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from './ontology';

/**
 * What "related" means for a claim, in one place: another claim carrying at least one of this
 * claim's topics *in this space* — topics are assigned per space, so the space is part of the
 * relation rather than a filter applied beside it.
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
 * related list, and as the *only* row when it has no neighbours. Every caller has to account for
 * it, and before drawing any conclusion from how many rows came back: the picker counts them to
 * decide whether to offer Related claims at all, so counting the claim itself makes "no neighbours"
 * look like "one neighbour" (GEO-2758).
 *
 * Where that happens depends on whether the caller pages. `excludeClaimId` takes it out of the
 * query, which is what a paged surface needs: dropping a row from a fetched page makes the page
 * size a ceiling, so asking for four returns four and shows three. The claim page's gallery passes
 * it for that reason.
 *
 * The picker still drops it in the caller. It does not page, so it can over-fetch and absorb the
 * loss, and it reads the rows for more than one purpose. Moving it onto `excludeClaimId` would be a
 * simplification rather than a fix, and is not one this clause should assume has happened.
 *
 * `topicIds` empty means there is nothing to be related *by*, and the clause would otherwise match
 * no relation at all and quietly return the space's entire claim list. Callers must not run the
 * query in that case; both gate on it.
 */
export function relatedClaimsWhere({
  spaceId,
  topicIds,
  requireTagId,
  excludeClaimId,
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
  /** Leave this claim out of its own related list (in the query, so pages stay full). */
  excludeClaimId?: string;
}): WhereCondition {
  return {
    ...(excludeClaimId ? { NOT: { id: { equals: excludeClaimId } } } : {}),
    types: [{ id: { equals: CLAIM_TYPE_ID } }],
    // Entity membership, which is the weaker of the two space tests here and is kept for what it
    // says: the claim is named in this space at all. It is *not* what ties either relation below to
    // this space — see the note on `space` there.
    spaces: [{ equals: spaceId }],
    relations: [
      // Both relations carry `space`, because both are assigned per space and `spaces` above does
      // not scope them. `tagged-claims.ts` learned this on the Debate tag and wrote down what it
      // measured: filtering on the entity's space set returned claims tagged in one space for a
      // space they merely also appeared in — four claims across three spaces, two of them in spaces
      // the facet counted as holding none. Topics behave the same way, which is why the source
      // claim's own topics are read through a space-scoped entity query rather than off an
      // unfiltered projection.
      //
      // Without this, "related" meant "shares a topic *somewhere*", so a claim related only in
      // another space was offered here — and, for the picker, offered as something to debate and
      // publish into *this* space.
      {
        typeOf: { id: { equals: TOPICS_PROPERTY_ID } },
        toEntity: { id: { in: topicIds } },
        space: { equals: spaceId },
      },
      // Two relation conditions are ANDed, each satisfied by *some* relation — checked against
      // both the local matcher (`matchesRelations`: `conditions.every(... relations.some(...))`)
      // and the GraphQL converter (`filter.and` of `relations: { some }`), which agree. A `values`
      // array does *not* agree across those two, so this is worth stating rather than assuming.
      // `space` is honoured on both paths too: `cond.space` against `relation.spaceId` locally, and
      // `filter.spaceId` once converted.
      ...(requireTagId
        ? [
            {
              typeOf: { id: { equals: TAG_PROPERTY_ID } },
              toEntity: { id: { in: [requireTagId] } },
              space: { equals: spaceId },
            },
          ]
        : []),
    ],
  };
}

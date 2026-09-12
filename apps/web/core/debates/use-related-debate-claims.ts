import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { relatedClaimsWhere } from '~/core/claims/related-claims';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';

import type { DebateClaimSummary } from './api';
import { DEBATE_TAG_ID } from './ontology';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from './use-debate-publishable-spaces';

/** How many neighbours the Related tab offers. */
export const RELATED_CLAIMS_LIMIT = 25;

/**
 * Extra rows discovery asks for, to absorb the ones dropped before the limit applies: the debated
 * claim itself, and any neighbour whose name has not indexed.
 */
const RELATED_DROPPED_ROW_SLACK = 8;

/** Stable empty list, so a skipped discovery is not a new array each render. */
const NO_RELATED_IDS: string[] = [];

export type RelatedDebateClaims = {
  /** Neighbours worth offering, with the debated claim and undrawable rows already dropped. */
  claimIds: string[];
  /**
   * The debated claim's space, in graph spelling — the space every row here belongs to, and so the
   * one a caller should prefer when drawing them.
   */
  spaceId: string | null;
  /** Whether the question was asked at all: no claim, no topics, or a space that cannot publish. */
  enabled: boolean;
  isLoading: boolean;
  error: unknown;
};

/**
 * The claims a pair could argue next: another claim carrying one of this claim's topics, tagged for
 * debating, in the same space (GEO-2758).
 *
 * Two callers, for two different reasons. The rematch picker reads the answer — it is the Related
 * tab. The debate room asks the same question while the debate is still running and throws the
 * answer away, because the wait is the problem this hook exists to solve: the claim being debated is
 * known minutes before the pair are offered another, but the chain from it to a list is three serial
 * requests — the debate, the claim's entity for its topics, then the topic query. Run at the moment
 * the picker mounts, that chain is a second of tab strip arriving after the page did. Run from the
 * room, it is already answered.
 *
 * Warming works because both callers land on the same keys — `useQueryEntity` on the claim id, and
 * `useQueryEntities` on a clause this module builds identically for both — so the picker's copy is a
 * cache read rather than a second round trip. That is also why the clause lives here rather than at
 * each call site: two spellings of the same question would warm a key nobody reads.
 */
export function useRelatedDebateClaims({
  claim,
  enabled = true,
}: {
  claim: DebateClaimSummary | null | undefined;
  enabled?: boolean;
}): RelatedDebateClaims {
  // geo-chat hands out dashed uuids where the graph stores bare hex, so the boundary is crossed
  // once, here, and everything downstream is a graph question. Each field is guarded on its own
  // rather than on the claim existing: a summary can arrive without a space, and `uuidToHex`
  // normalizes with `String.replace`, so a missing one throws rather than reading as absent.
  const claimId = claim?.claim_entity_id ? uuidToHex(claim.claim_entity_id) : null;
  const spaceId = claim?.space_id ? uuidToHex(claim.space_id) : null;

  // Null from this means "not known yet" and must not filter, so `isSpaceDebatePublishable` reads it
  // as "don't filter" — see that hook. Discovery fails open for the same reason its other callers
  // do: a list that briefly offers a space the reconciliation goes on to remove is better than a
  // list that waits on it.
  const { publishableSpaceIds } = useDebatePublishableSpaces();

  /**
   * Topics live on the graph entity rather than geo-chat's claim summary, and they are assigned *per
   * space* — so the claim is hydrated with the debate's space, the same way the claim page hydrates
   * it for the same purpose.
   *
   * `useClaimEntitiesByIds` was the obvious hook and is the wrong one: its projection selects
   * relations with no space filter, so a topic assigned only in some other space would come back and
   * pull in neighbours the claim's own Related gallery does not show.
   */
  const sourceQuery = useQueryEntity({
    id: claimId ?? '',
    spaceId: spaceId ?? undefined,
    enabled: enabled && claimId !== null,
  });

  const topicIds = React.useMemo(() => {
    const entity = sourceQuery.entity;
    if (!entity) return NO_RELATED_IDS;
    return entity.relations
      .filter(relation => relation.isDeleted !== true && idEquals(relation.type.id, TOPICS_PROPERTY_ID))
      .map(relation => relation.toEntity.id);
  }, [sourceQuery.entity]);

  /**
   * Skipped with no topics rather than asked with an empty `in`, which matches no relation and would
   * quietly return the space's entire claim list. Skipped too when the claim's own space cannot
   * carry a published debate: every row is drawn in that space, so there is nothing to ask for.
   */
  const queryEnabled =
    enabled &&
    claimId !== null &&
    spaceId !== null &&
    topicIds.length > 0 &&
    isSpaceDebatePublishable(spaceId, publishableSpaceIds);

  const entitiesQuery = useQueryEntities({
    where: relatedClaimsWhere({
      spaceId: spaceId ?? '',
      topicIds,
      // The one place this diverges from the claim page's gallery, and it is a difference in
      // purpose: this list answers "what should this pair argue next", so it wants only what a
      // curator marked for debating.
      requireTagId: DEBATE_TAG_ID,
    }),
    // Sized against what is dropped below before the limit applies. Slack rather than a second
    // request: this list does not page.
    first: RELATED_CLAIMS_LIMIT + RELATED_DROPPED_ROW_SLACK,
    // Without this, `useQueryEntities` answers from the local store before the first fetch resolves,
    // and those ids fire a caller's row lookups a moment before the real answer replaces them.
    deferUntilFetched: true,
    prefetchNextPage: false,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: queryEnabled,
  });

  /**
   * The debated claim carries its own topics, so the graph returns it in its own related list — and,
   * having just been debated, near the front of it. Dropped here rather than left to the caller's
   * exclusions, because the count decides whether the Related tab exists at all: leaving it in makes
   * a claim with no neighbours look like a claim with one.
   *
   * Unnamed neighbours go for the same reason — they cannot be drawn, and a missing name is knowable
   * from this very query.
   */
  const claimIds = React.useMemo(
    () =>
      queryEnabled && claimId
        ? entitiesQuery.entities
            .filter(entity => Boolean(entity.name))
            .map(entity => entity.id)
            .filter(id => !idEquals(id, claimId))
            .slice(0, RELATED_CLAIMS_LIMIT)
        : NO_RELATED_IDS,
    [queryEnabled, entitiesQuery.entities, claimId]
  );

  return {
    claimIds,
    spaceId,
    enabled: queryEnabled,
    // Both lookups, reported together, so a caller cannot gate on a different subset than it reads —
    // the mistake that let one gate pass while the other was still waiting.
    isLoading: sourceQuery.isLoading || entitiesQuery.isLoading,
    error: sourceQuery.error ?? entitiesQuery.error ?? null,
  };
}

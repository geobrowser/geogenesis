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

/**
 * How many further windows discovery will walk when a whole one turns out to be undrawable.
 *
 * A cap rather than "until the server runs out": each step is a request, and a topic whose claims
 * are mostly unnamed would spend an unbounded number of them to populate a tab nobody asked for.
 * Four *further* windows on top of the first is five requests and 165 rows, past which "no
 * neighbours left to argue" is the honest answer even if one is hiding further down.
 */
const RELATED_MAX_EXTRA_WINDOWS = 4;

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
  const { publishableSpaceIds, isLoading: publishableSpacesLoading } = useDebatePublishableSpaces({ enabled });

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
    // The space is required, not merely used: this hook allows a claim summary that carries no
    // space, and hydrating one unscoped asks a question whose answer can never be used — the topics
    // would come from every space at once, and `discoverable` below can never be true without a
    // space anyway. Reported as loading, it reserved a Related tab that was always going to vanish
    // when the pointless hydration finished. If the space arrives later, this enables then.
    enabled: enabled && claimId !== null && spaceId !== null,
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
  /**
   * Whether there is anything to discover at all — a claim, its space, and something to be related
   * *by*. Separate from {@link queryEnabled} because the allowlist below is the one input that can
   * still be in flight when the answer is already no, and reporting that as pending invented a tab
   * on a session that could never have one: a profile-challenge rematch has no debated claim, but
   * the allowlist is a page-wide request that is in flight regardless.
   */
  const discoverable = enabled && claimId !== null && spaceId !== null && topicIds.length > 0;

  const queryEnabled = discoverable && isSpaceDebatePublishable(spaceId ?? '', publishableSpaceIds);

  /**
   * Where discovery has walked to, and how far.
   *
   * A window can come back entirely undrawable — the debated claim is in its own related list, and
   * neighbours whose names have not indexed cannot be drawn — and the count decides whether the tab
   * exists. Treating that window as the whole answer hid the tab from a claim that does have
   * neighbours, a page further down. The claim page's gallery skips forward on exactly this data
   * (`claim-related-claims.tsx`), so a tab that gave up where the gallery does not would have been
   * two surfaces disagreeing about the same claim.
   */
  /**
   * A cursor belongs to the question it was issued against, so it is stored with that question and
   * ignored the moment the question changes — rather than cleared by an effect, which would run a
   * render *after* the change and spend one request anchored in the old result set.
   *
   * The topics are part of the question, not just the claim: they arrive from hydration, so the
   * first windows can be walked against a cached topic set and a later one replaces it. A cursor
   * kept across that starts the new query midway through a result set it never saw the front of,
   * and the rows it skipped are simply never offered.
   */
  const question = `${claimId ?? ''}:${spaceId ?? ''}:${topicIds.join(',')}`;
  const [walked, setWalked] = React.useState<{ question: string; cursor: string; windows: number } | null>(null);
  const walkedHere = walked?.question === question ? walked : null;

  const entitiesQuery = useQueryEntities({
    after: walkedHere?.cursor,
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

  /**
   * Whether this window answered nothing and there is another to try.
   *
   * Only while the window is empty: one drawable neighbour is enough for the tab to exist, and
   * walking on to fill the list would spend requests to lengthen a list most pairs take the first
   * row of.
   */
  const walking =
    queryEnabled &&
    !entitiesQuery.isLoading &&
    claimIds.length === 0 &&
    entitiesQuery.hasNextPage &&
    entitiesQuery.endCursor !== null &&
    (walkedHere?.windows ?? 0) < RELATED_MAX_EXTRA_WINDOWS;

  React.useEffect(() => {
    if (!walking) return;
    const cursor = entitiesQuery.endCursor;
    if (cursor === null) return;
    // Guarded on the cursor rather than set outright: this effect re-runs while the next window is
    // in flight, and re-setting the same anchor would be a render loop rather than a step.
    setWalked(current =>
      current?.question === question && current.cursor === cursor
        ? current
        : { question, cursor, windows: (current?.question === question ? current.windows : 0) + 1 }
    );
  }, [walking, entitiesQuery.endCursor, question]);

  return {
    claimIds,
    spaceId,
    enabled: queryEnabled,
    // Both lookups, reported together, so a caller cannot gate on a different subset than it reads —
    // the mistake that let one gate pass while the other was still waiting.
    //
    // A walk to the next window counts as loading: the count is not final until it stops, and a
    // caller that read "empty, settled" between two windows would drop the tab and then bring it
    // back. Not covered by a test — `render` flushes the whole walk inside one `act`, so every
    // assertion lands after it, and an assertion that cannot see the gap would pass without it.
    // The allowlist counts too, but only where there is something for it to decide. It fails open —
    // a null set reads as "don't filter" — so while it is in flight `queryEnabled` can be true for a
    // space the response goes on to exclude, and a caller that treated this as settled would offer
    // the tab and then take it away. Where nothing is discoverable it decides nothing, and reporting
    // it would hold a slot open on a session that can never fill it. Only while in flight, either
    // way: after an error the ids stay null and fail-open is the final answer, so waiting past that
    // would be waiting forever.
    isLoading:
      (discoverable && publishableSpacesLoading) || sourceQuery.isLoading || entitiesQuery.isLoading || walking,
    error: sourceQuery.error ?? entitiesQuery.error ?? null,
  };
}

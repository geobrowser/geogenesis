'use client';

import * as React from 'react';

import { useTopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { TopicExploreFeedCard } from '~/partials/explore/topic-explore-feed-card';
import { PersonRecordFeed } from '~/partials/profile/person-record-feed';

import { useClaimExploreRows } from './use-claim-explore-rows';

/**
 * The claim's topics, as an explore feed.
 *
 * It was a row of chips, which is the right answer for a header strip and the wrong one for a tab:
 * a chip says a topic's name and nothing else, so a tab of them is a list with no way to tell which
 * entry is worth opening. As cards they carry what the graph already knows about each topic — its
 * description, its picture, and how much is attached to it — which is also what this list is
 * ordered by.
 *
 * Ordered by the metadata it shows — debates + claims + news stories totalled, largest first. That
 * is the ask's first choice and the one worth having, since "Best" over a handful of topics
 * resolves to an order a reader cannot see. Ties break on claims, then on name, so the list is
 * stable rather than merely sorted. (The card names those three in a different order than they are
 * summed in; the sum is over all three either way.)
 *
 * Nothing renders until the counts are in. The rows and the counts are two requests, and painting
 * the first would show the claim's own topic order and then resequence it under the reader — the
 * same trade `useTopicLinkedEntities` makes, for the same reason.
 *
 * And nothing is ordered unless *every* count arrived. A partial answer falls back to the claim's
 * order rather than ranking the topics it could not measure as zero.
 *
 * The feed itself is `PersonRecordFeed`, as the Sources tab does with the same shape of question —
 * a bounded id list hydrated into explore cards. It draws a topic card instead of the shared one;
 * everything around the rows is the same and is not worth a second copy.
 */
export function ClaimTopicsTab({ topics, spaceId }: { topics: Relation[]; spaceId: string }) {
  // The claim's order, deduped: a topic related twice in different spaces is one card.
  const topicIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const topic of topics) {
      const key = normId(topic.toEntity.id);
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(topic.toEntity.id);
    }
    return ids;
  }, [topics]);

  const counts = useTopicConnectionCounts(topicIds);
  // Hydrated in the claim's order and sorted afterwards. Sorting the ids first would work and would
  // also change the query key the moment the counts landed, paying for the whole list twice.
  const rows = useClaimExploreRows(topicIds, spaceId, topicIds.length > 0);

  const countsByTopicId = counts.countsByTopicId;
  const countsFailed = counts.isError;
  const ordered = React.useMemo(() => {
    // Ordering is a promise about *all* the numbers, so a partial answer cannot keep it. The
    // counts arrive in batches, and one batch can fail while another succeeds — which leaves a map
    // covering some topics and not others. Sorting on that ranks every unmeasured topic as zero
    // and then alphabetises it: neither the claim's order nor largest-first, and nothing on screen
    // says which. So any failure falls back to the claim's order, exactly as a total failure
    // already did. The counts that did arrive still reach their own cards.
    if (!countsByTopicId || countsFailed) return rows.data;

    const totalOf = (entityId: string) => countsByTopicId[normId(entityId)];

    return [...rows.data].sort(
      (a, b) =>
        (totalOf(b.entityId)?.total ?? 0) - (totalOf(a.entityId)?.total ?? 0) ||
        (totalOf(b.entityId)?.claims ?? 0) - (totalOf(a.entityId)?.claims ?? 0) ||
        a.title.localeCompare(b.title)
    );
  }, [countsByTopicId, countsFailed, rows.data]);

  // The parent only offers this tab when the claim has topics. The route stays addressable
  // directly, matching the Sources tab, so a stale bookmark still gets an honest empty state.
  if (topicIds.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">No topics have been linked to this claim yet.</p>;
  }

  return (
    <PersonRecordFeed
      // Held back until the counts land, not merely marked loading: the feed prints its loading
      // label only while it has no rows, so handing it the unsorted ones would paint the claim's
      // own topic order and resequence it a beat later — exactly what waiting exists to prevent.
      rows={counts.isLoading ? [] : ordered}
      isLoading={rows.isLoading || counts.isLoading}
      isError={rows.isError}
      // These ids are loaded as one bounded record, not paginated. A refetch is an error retry or a
      // background refresh and must not draw the feed's next-page skeletons.
      isFetchingNextPage={false}
      onRetry={rows.refetch}
      loadingLabel="Loading topics…"
      emptyLabel="No linked topics could be displayed."
      errorLabel="Couldn’t load topics."
      noun="topics"
      renderCard={item => (
        <TopicExploreFeedCard
          item={item}
          counts={countsByTopicId?.[normId(item.entityId)] ?? null}
          // The claim page is one column a reader scrolls; a topic is what they came here to open.
          titleOpensSidePanel
          hideJoinButton
        />
      )}
    />
  );
}

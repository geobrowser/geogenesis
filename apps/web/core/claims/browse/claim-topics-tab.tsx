'use client';

import * as React from 'react';

import { toExploreFeedItem } from '~/core/explore/explore-card-item';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { useTopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { TopicExploreFeedCard } from '~/partials/explore/topic-explore-feed-card';
import { RecordLoadError } from '~/partials/profile/partial-load-error';

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
 * Ordered by the metadata it shows: claims + news stories + debates, largest first. That is the
 * ask's first choice and the one worth having, since "Best" over a handful of topics resolves to an
 * order a reader cannot see. Ties break on claims, then on name, so the list is stable rather than
 * merely sorted.
 *
 * Nothing renders until the counts are in. The rows and the counts are two requests, and painting
 * the first would show the claim's own topic order and then resequence it under the reader — the
 * same trade `useTopicLinkedEntities` makes, for the same reason.
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

  const ordered = React.useMemo(() => {
    const byTopicId = counts.countsByTopicId;
    const withCounts = rows.data.map(row => ({ row, counts: byTopicId?.[normId(row.entityId)] ?? null }));
    if (!byTopicId) return withCounts;

    return withCounts.sort(
      (a, b) =>
        (b.counts?.total ?? 0) - (a.counts?.total ?? 0) ||
        (b.counts?.claims ?? 0) - (a.counts?.claims ?? 0) ||
        a.row.title.localeCompare(b.row.title)
    );
  }, [counts.countsByTopicId, rows.data]);

  const rowSpaceIds = React.useMemo(() => [...new Set(ordered.map(entry => entry.row.spaceId))], [ordered]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  // The parent only offers this tab when the claim has topics. The route stays addressable
  // directly, matching the Sources tab, so a stale bookmark still gets an honest empty state.
  if (topicIds.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">No topics have been linked to this claim yet.</p>;
  }

  if (rows.isLoading || counts.isLoading) {
    return <p className="py-6 text-metadata text-grey-04">Loading topics…</p>;
  }

  if (rows.isError && ordered.length === 0) {
    return <RecordLoadError message="Couldn’t load topics." onRetry={rows.refetch} />;
  }

  if (ordered.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">No linked topics could be displayed.</p>;
  }

  return (
    <div className="pt-1">
      {ordered.map(entry => (
        <TopicExploreFeedCard
          key={`${entry.row.entityId}-${entry.row.spaceId}`}
          item={toExploreFeedItem(entry.row, spaceLabel(labelsById, entry.row.spaceId))}
          counts={entry.counts}
          // The claim page is one column a reader scrolls; a topic is what they came here to open.
          titleOpensSidePanel
          hideJoinButton
        />
      ))}
    </div>
  );
}

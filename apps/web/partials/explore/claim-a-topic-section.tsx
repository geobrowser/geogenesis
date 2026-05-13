'use client';

import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { RootTopicChip, RootTopicsData } from '~/core/io/subgraph/fetch-root-topics';
import type { TopicSpaceOption } from '~/core/io/subgraph/fetch-topic-space-options';
import { NavUtils } from '~/core/utils/utils';

import { Dropdown } from '~/design-system/dropdown';
import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = {
  /** SSR-supplied topics for the "Any space" case. */
  topics: RootTopicChip[];
  spaceOptions: TopicSpaceOption[];
};

const INITIAL_VISIBLE_COUNT = 12;
const ANY_SPACE_VALUE = 'all';
const ANY_SPACE_LABEL = 'Any space';

async function fetchTopicsForSpace(spaceId: string): Promise<RootTopicChip[]> {
  const res = await fetch(`/api/explore/topics?spaceId=${encodeURIComponent(spaceId)}`);
  if (!res.ok) throw new Error('Failed to load topics');
  const data = (await res.json()) as RootTopicsData;
  return data.unclaimed;
}

export function ClaimATopicSection({ topics, spaceOptions }: Props) {
  const [showAll, setShowAll] = React.useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = React.useState<string>(ANY_SPACE_VALUE);

  // When a specific space is selected, re-run the topics query scoped to that
  // space so we surface topics that fell outside the global page-size cap.
  const scopedQuery = useQuery({
    queryKey: ['explore-topics', selectedSpaceId],
    queryFn: () => fetchTopicsForSpace(selectedSpaceId),
    enabled: selectedSpaceId !== ANY_SPACE_VALUE,
    staleTime: 30_000,
  });

  const isLoading = selectedSpaceId !== ANY_SPACE_VALUE && scopedQuery.isFetching && !scopedQuery.data;

  const visibleTopics = React.useMemo(() => {
    if (selectedSpaceId === ANY_SPACE_VALUE) return topics;
    return scopedQuery.data ?? [];
  }, [selectedSpaceId, topics, scopedQuery.data]);

  if (topics.length === 0 && spaceOptions.length === 0) return null;

  const visible = showAll ? visibleTopics : visibleTopics.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = visibleTopics.length > INITIAL_VISIBLE_COUNT;

  const selectedLabel =
    selectedSpaceId === ANY_SPACE_VALUE
      ? ANY_SPACE_LABEL
      : (spaceOptions.find(o => o.id === selectedSpaceId)?.name ?? ANY_SPACE_LABEL);

  const dropdownOptions = [
    {
      label: ANY_SPACE_LABEL,
      value: ANY_SPACE_VALUE,
      disabled: false,
      onClick: () => {
        setSelectedSpaceId(ANY_SPACE_VALUE);
        setShowAll(false);
      },
    },
    ...spaceOptions.map(option => ({
      label: option.name,
      value: option.id,
      disabled: false,
      onClick: () => {
        setSelectedSpaceId(option.id);
        setShowAll(false);
      },
    })),
  ];

  return (
    <section className="flex flex-col gap-4">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-divider bg-white pt-1 pb-3">
        <h2 className="text-[16px] leading-[20px] font-semibold tracking-[-0.02em] text-text">
          Available topics to claim
        </h2>
        {spaceOptions.length > 0 && (
          <Dropdown
            align="end"
            scrollableList
            trigger={<span className="text-[12px] leading-[13px] text-grey-04">{selectedLabel}</span>}
            options={dropdownOptions}
          />
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <span className="text-[13px] leading-[14px] text-grey-04">Loading topics…</span>
        ) : visible.length === 0 ? (
          <span className="text-[13px] leading-[14px] text-grey-04">No topics in this space yet.</span>
        ) : (
          visible.map(topic => {
            // Pick one of the topic's actual spaces as the link context — using
            // a space the entity doesn't live in triggers SpaceRedirect's
            // history-replacing client redirect and traps the user. Topics
            // without any containing space are filtered upstream in
            // fetch-root-topics, so this access is safe in practice.
            const linkSpaceId = topic.spaceIds[0];
            return (
              <Link
                key={topic.id}
                href={NavUtils.toEntity(linkSpaceId, topic.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-grey-02 px-2.5 py-1 text-[13px] leading-[14px] text-text transition-colors hover:bg-grey-01"
              >
                <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-grey-01">
                  <FallbackImage value={topic.image} sizes="16px" className="object-cover" />
                </span>
                <span className="truncate">{topic.name}</span>
              </Link>
            );
          })
        )}

        {hasMore && !showAll && !isLoading ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex items-center rounded-full border border-grey-02 px-2.5 py-1 text-[13px] leading-[14px] text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
          >
            Show more
          </button>
        ) : null}
      </div>
    </section>
  );
}

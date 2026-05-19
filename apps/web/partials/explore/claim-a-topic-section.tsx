'use client';

import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { RootTopicChip } from '~/core/io/subgraph/fetch-first-level-subtopics';
import type { ParentTopicOption } from '~/core/io/subgraph/fetch-parent-topic-options';
import { NavUtils } from '~/core/utils/utils';

import { Dropdown } from '~/design-system/dropdown';
import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = {
  topics: RootTopicChip[];
  parentTopicOptions: ParentTopicOption[];
};

const INITIAL_VISIBLE_COUNT = 12;
const ANY_TOPIC_VALUE = 'all';
const ANY_TOPIC_LABEL = 'Any topic';

async function fetchSubtopicsForParent(parentId: string, signal?: AbortSignal): Promise<RootTopicChip[]> {
  const res = await fetch(`/api/explore/topics?parentId=${encodeURIComponent(parentId)}`, { signal });
  if (!res.ok) throw new Error('Failed to load subtopics');
  const data = (await res.json()) as { topics: RootTopicChip[] };
  return data.topics;
}

export function ClaimATopicSection({ topics, parentTopicOptions }: Props) {
  const [showAll, setShowAll] = React.useState(false);
  const [selectedParentId, setSelectedParentId] = React.useState<string>(ANY_TOPIC_VALUE);

  // Per-parent fetch: the SSR `topics` list is capped at the 200 most-recent
  // unclaimed curated topics globally, so client-side filtering by parent ID
  // could miss subtopics that fall outside that window. Hitting the API gives
  // us the full set for the selected parent.
  const subtopicsQuery = useQuery({
    queryKey: ['explore-subtopics', selectedParentId],
    queryFn: ({ signal }) => fetchSubtopicsForParent(selectedParentId, signal),
    enabled: selectedParentId !== ANY_TOPIC_VALUE,
    staleTime: 30_000,
    // Drop cached parent results after 5 minutes of disuse — most users only
    // browse a few parents per session, so unbounded caching is wasteful.
    gcTime: 5 * 60_000,
  });

  const isLoading = selectedParentId !== ANY_TOPIC_VALUE && subtopicsQuery.isFetching && !subtopicsQuery.data;

  const visibleTopics = React.useMemo(() => {
    if (selectedParentId === ANY_TOPIC_VALUE) return topics;
    return subtopicsQuery.data ?? [];
  }, [selectedParentId, topics, subtopicsQuery.data]);

  if (topics.length === 0 && parentTopicOptions.length === 0) return null;

  const visible = showAll ? visibleTopics : visibleTopics.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = visibleTopics.length > INITIAL_VISIBLE_COUNT;

  const selectedLabel =
    selectedParentId === ANY_TOPIC_VALUE
      ? ANY_TOPIC_LABEL
      : (parentTopicOptions.find(o => o.id === selectedParentId)?.name ?? ANY_TOPIC_LABEL);

  const dropdownOptions = [
    {
      label: ANY_TOPIC_LABEL,
      value: ANY_TOPIC_VALUE,
      disabled: false,
      onClick: () => {
        setSelectedParentId(ANY_TOPIC_VALUE);
        setShowAll(false);
      },
    },
    ...parentTopicOptions.map(option => ({
      label: option.name,
      value: option.id,
      disabled: false,
      onClick: () => {
        setSelectedParentId(option.id);
        setShowAll(false);
      },
    })),
  ];

  return (
    <section className="flex flex-col gap-4">
      {/* z-30 keeps the dropdown popover above the Recently Claimed sticky header
          (z-20) which sits later in DOM order. Without this, the popover gets
          painted over when its menu extends past the section boundary. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-divider bg-white pt-1 pb-3">
        <h2 className="text-[16px] leading-[20px] font-semibold tracking-[-0.02em] text-text">
          Available topics to claim
        </h2>
        {parentTopicOptions.length > 0 && (
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
          <span className="text-[13px] leading-[14px] text-grey-04">No unclaimed topics under this parent yet.</span>
        ) : (
          visible.map(topic => {
            // Pick one of the topic's actual spaces as the link context — using
            // a space the entity doesn't live in triggers SpaceRedirect's
            // history-replacing client redirect and traps the user. Topics
            // without any containing space are filtered upstream, so this
            // access is safe in practice.
            const linkSpaceId = topic.spaceIds[0];
            return (
              <Link
                key={topic.id}
                href={NavUtils.toEntity(linkSpaceId, topic.id)}
                aria-label={topic.name}
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

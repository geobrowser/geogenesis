'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { RootTopicChip } from '~/core/io/subgraph/fetch-first-level-subtopics';
import type { ParentTopicOption } from '~/core/io/subgraph/fetch-parent-topic-options';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';
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
  const [menuOpen, setMenuOpen] = React.useState(false);

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

  const menuOptions: { label: string; value: string }[] = [
    { label: ANY_TOPIC_LABEL, value: ANY_TOPIC_VALUE },
    ...parentTopicOptions.map(option => ({ label: option.name, value: option.id })),
  ];

  const selectParent = (value: string) => {
    setSelectedParentId(value);
    setShowAll(false);
    setMenuOpen(false);
  };

  return (
    <section className="flex flex-col">
      {/* z-30 keeps the dropdown popover above the Recently Claimed sticky header
          (z-20) which sits later in DOM order. Without this, the popover gets
          painted over when its menu extends past the section boundary. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-white pt-1 pb-4">
        <h2 className="text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">
          Available topics to claim
        </h2>
        {parentTopicOptions.length > 0 && (
          <Menu
            asChild
            open={menuOpen}
            onOpenChange={setMenuOpen}
            sideOffset={8}
            className="max-w-60 bg-white"
            trigger={
              <button
                type="button"
                className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text"
              >
                <span>{selectedLabel}</span>
                <span className={`inline-flex transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}>
                  <ChevronDownSmall color="grey-04" />
                </span>
              </button>
            }
          >
            {menuOptions.map(option => (
              <MenuItem key={option.value} active={option.value === selectedParentId} onClick={() => selectParent(option.value)}>
                {option.label}
              </MenuItem>
            ))}
          </Menu>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <span className="text-[16px] leading-[18px] text-grey-04">Loading topics…</span>
        ) : visible.length === 0 ? (
          <span className="text-[16px] leading-[18px] text-grey-04">No unclaimed topics under this parent yet.</span>
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
                className="inline-flex items-center gap-1.5 rounded-full border border-grey-02 py-1.5 pl-2 pr-2.5 text-[16px] leading-[18px] text-text transition-colors hover:border-text"
              >
                <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-grey-01">
                  <FallbackImage value={topic.image} sizes="16px" className="object-cover" />
                </span>
                <span className="truncate">{topic.name}</span>
              </Link>
            );
          })
        )}

        {hasMore && !isLoading ? (
          <button
            type="button"
            onClick={() => setShowAll(prev => !prev)}
            className="inline-flex items-center rounded-full border border-grey-02 py-1.5 pl-2 pr-2.5 text-[16px] leading-[18px] text-grey-04 transition-colors hover:border-text hover:text-text"
          >
            {showAll ? 'Show less' : 'Show more'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

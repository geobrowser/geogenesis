'use client';

import * as React from 'react';

import cx from 'classnames';

import { buildClaimDraft } from '~/core/claims/claim-draft';
import { TOPIC_TYPE_ID } from '~/core/claims/ontology';
import { toggleId } from '~/core/debates/matchmaking/topic-facets';
import { useInfiniteSentinel } from '~/core/profile/use-infinite-sentinel';
import { type SpaceActivitySort } from '~/core/space/space-activity-rows';
import {
  useSpaceActivityRowsInfinite,
  useSpaceClaimSearch,
  useSpaceClaimTopicFacet,
} from '~/core/space/use-space-debate-activity';
import { useDiff } from '~/core/state/diff-store';
import { useMutate } from '~/core/sync/use-mutate';

import { Button } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';
import { SelectEntityCompact, type SelectEntityCompactResult } from '~/design-system/select-entity-compact';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';
import { SpaceClaimsFilters } from '~/partials/space-page/space-claims-filters';

type ClaimsPageClientProps = {
  spaceId: string;
};

type RelatedSelectionKey = 'topics';

type RelatedField = {
  key: RelatedSelectionKey;
  label: string;
  placeholder: string;
  typeId: string;
};

const relatedFields: RelatedField[] = [
  {
    key: 'topics',
    label: 'Topics',
    placeholder: 'Search topics...',
    typeId: TOPIC_TYPE_ID,
  },
];

/**
 * A space's claims, ranked, searchable and filterable, as their own full-bleed browse surface.
 *
 * This was a fixed list of up to fifty claims in whatever order the entity store happened to hold
 * them, framed inside the space's tab bar. It is now the destination of "See all claims", so it has
 * to answer the question that link asks — what is worth reading here — which means an order the
 * reader picks, a way to narrow it, no floor on how far you can scroll, and a surface of its own
 * rather than a tab of the space page.
 *
 * Edge-to-edge like the debates feed on the sibling route: `Main` drops its max-width and padding
 * here and `SpaceChromeGate` strips the space header and tabs, so the column and the top padding
 * below are this page's to supply. The app navbar stays, which is the way back.
 *
 * Search, topics and the tag gate all run server-side through the same `taggedEntityFilter` clause
 * the topic menu is counted through, so the menu and the list cannot disagree about what is in the
 * corpus. Like Explore, the list is the claims a curator has tagged `Debate` (GEO-2835) rather than
 * every claim in the space: this surface is about debate activity.
 *
 * The staging form stays. It is unrelated to how the list is ordered, and it is the only place in
 * the app that opens a claim proposal from a space. What it no longer does is show the staged claim
 * in the list below before it is published — the list reads the graph, not the local edit store —
 * and staging already opens the review panel, which is where a draft lives until it is published.
 */
export function ClaimsPageClient({ spaceId }: ClaimsPageClientProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [sort, setSort] = React.useState<SpaceActivitySort>('best');
  const [search, setSearch] = React.useState('');
  const [topicIds, setTopicIds] = React.useState<string[]>([]);

  const {
    claimIds,
    search: debouncedSearch,
    isPending: isSearchPending,
    error: searchError,
    retry: retrySearch,
  } = useSpaceClaimSearch(search, true);
  // The *debounced* text rides along for the topic menu, which resolves its own ids from it through
  // the same query the hook above already filled — the raw box would key a second search per
  // keystroke. The rows are narrowed by `searchClaimIds`. See `SpaceActivityFilters`.
  const filters = React.useMemo(
    () => ({ topicIds, search: debouncedSearch, searchClaimIds: claimIds, isSearchPending, searchError }),
    [claimIds, debouncedSearch, isSearchPending, searchError, topicIds]
  );

  const { rows, isLoading, isError, isPending, hasNextPage, isFetchingNextPage, fetchNextPage, retry } =
    useSpaceActivityRowsInfinite(spaceId, 'claims', sort, filters);
  const facet = useSpaceClaimTopicFacet(spaceId, filters, true);

  const sentinelRef = useInfiniteSentinel({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isError,
  });

  // The rows on screen describe the previous question while the next answer is out. Dimming says
  // so without taking them away, which is what an empty list between two filters would imply. A
  // failed search is not stale — it has an error to draw, and dimming behind one reads as loading.
  const isStale = (isPending || isSearchPending) && searchError === null;
  const hasNarrowed = search.trim().length > 0 || topicIds.length > 0;

  // `toggleId`, not a local include/filter. It compares canonically, because the facet answers in
  // dashed uuids where the rows carry dashless ones — an id-equality toggle would then *add* a
  // second spelling of a topic already picked instead of removing it. It also appends, which is
  // what `orderFacetOptions` pins the menu by.
  const toggleTopic = React.useCallback((topicId: string) => {
    setTopicIds(current => toggleId(current, topicId));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 pt-8 pb-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="smallTitle" color="text">
          Claims
        </Text>
        {!formOpen && (
          <Button type="button" variant="secondary" icon={<Plus />} onClick={() => setFormOpen(true)}>
            Add claim
          </Button>
        )}
      </div>

      {formOpen && (
        <div className="mb-6">
          <AddClaimForm spaceId={spaceId} onCancel={() => setFormOpen(false)} />
        </div>
      )}

      <SpaceClaimsFilters
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        topicIds={topicIds}
        onTopicToggle={toggleTopic}
        onTopicsClear={() => setTopicIds([])}
        topics={facet.topics}
        countsPending={!facet.settled && facet.error === null}
      />

      <div className={cx('mt-5 transition-opacity', isStale && 'opacity-60')}>
        {searchError ? (
          /*
           * Its own state, ahead of the list's. A failed `/search` leaves the ids unresolved, so
           * the rows below cannot be narrowed to what was typed — listing the space unfiltered
           * would answer a question nobody asked, and holding the dim would claim it is still
           * coming when nothing is in flight.
           */
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white px-5 py-3">
            <Text color="grey-04">Could not search claims.</Text>
            <Button type="button" variant="secondary" onClick={retrySearch}>
              Retry
            </Button>
          </div>
        ) : isError && rows.length === 0 ? (
          <Text color="grey-04">Could not load claims.</Text>
        ) : isLoading ? (
          <ClaimsSkeleton />
        ) : rows.length === 0 ? (
          <Text color="grey-04">{hasNarrowed ? 'No claims match these filters.' : 'No claims here yet.'}</Text>
        ) : (
          rows.map(row => (
            <ExploreFeedCard
              key={`${row.entityId}-${row.spaceId}`}
              item={{ ...row, spaceName: '', spaceImage: null, hasPendingMembershipRequest: false }}
              // Every row is this space by construction, so a space chip and a Join button would
              // say the same thing on all of them.
              hideSpaceLink
              hideJoinButton
              claimCardVariant="debate-panel-mobile"
            />
          ))
        )}
        <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
        {isFetchingNextPage ? <ClaimsSkeleton rows={3} /> : null}
        {/*
          A failure with rows already on screen. The sentinel stops observing on an error — it has
          to, or a failing page is asked for forever — so without this the feed simply stops
          growing with nothing to say why and no way to try again.
        */}
        {isError && rows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white px-5 py-3">
            <Text color="grey-04">Could not load more claims.</Text>
            <Button type="button" variant="secondary" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClaimsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-grey-02 p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function AddClaimForm({ spaceId, onCancel }: { spaceId: string; onCancel: () => void }) {
  const { storage } = useMutate();
  const { setActiveSpace, bumpReviewVersion, setIsReviewOpen } = useDiff();
  const [claimText, setClaimText] = React.useState('');
  const [topics, setTopics] = React.useState<SelectEntityCompactResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const selectionsByKey = {
    topics,
  };

  const setSelectionsByKey = {
    topics: setTopics,
  };

  const addSelection = (key: RelatedSelectionKey, selection: SelectEntityCompactResult) => {
    setSelectionsByKey[key](current => {
      if (current.some(item => item.id === selection.id)) return current;
      return [...current, selection];
    });
  };

  const removeSelection = (key: RelatedSelectionKey, id: string) => {
    setSelectionsByKey[key](current => current.filter(item => item.id !== id));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const draft = buildClaimDraft({
        spaceId,
        claimText,
        topics,
      });

      for (const name of draft.names) {
        storage.entities.name.set(name.entityId, name.spaceId, name.value);
      }

      for (const relation of draft.relations) {
        storage.relations.set(relation);
      }

      setActiveSpace(spaceId);
      bumpReviewVersion();
      setIsReviewOpen(true);
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stage the claim.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-grey-02 bg-white p-5 shadow-light">
      <div className="space-y-4">
        <label className="block">
          <Text as="span" variant="metadataMedium" color="text">
            Claim
          </Text>
          <textarea
            value={claimText}
            onChange={event => setClaimText(event.target.value)}
            rows={3}
            className="mt-2 block w-full resize-y rounded-md border border-grey-02 bg-white px-3 py-2 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            placeholder="What should this space decide?"
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          {relatedFields.map(field => (
            <div key={field.key} className="min-w-0">
              <Text as="div" variant="metadataMedium" color="text" className="mb-2">
                {field.label}
              </Text>
              <SelectEntityCompact
                spaceId={spaceId}
                placeholder={field.placeholder}
                relationValueTypes={[{ id: field.typeId }]}
                selected={selectionsByKey[field.key]}
                onDone={selection => addSelection(field.key, selection)}
                onRemoveSelected={id => removeSelection(field.key, id)}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <Text as="p" variant="body" color="red-01" className="mt-4">
          {error}
        </Text>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Open proposal</Button>
      </div>
    </form>
  );
}

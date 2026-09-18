'use client';

import * as React from 'react';

import type { HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import {
  matchingEntityIds,
  narrowedFacets,
  preferredSpacesFor,
  usePersonPositionIndex,
} from '~/core/profile/use-person-position-index';
import { type PositionSort, usePersonPositions } from '~/core/profile/use-person-positions';

import { PersonRecordFeed } from './person-record-feed';
import { RecordFilterRow } from './record-filter-row';
import { useRecordSelection } from './use-record-selection';

/**
 * The claims a person holds a position on (GEO-2859, GEO-2918).
 *
 * Claims, not votes — a vote is an event with nothing to show, where a claim has
 * a name, a tally and a space. That is also what lets the explore feed's own
 * card render this untouched.
 *
 * Both menus narrow the whole record rather than the part on screen, which is
 * why the index behind them is complete. One built from the pages already
 * fetched would offer topics that lead nowhere and counts describing the
 * reader's scroll position.
 */
const SORT_OPTIONS: HubFilterOption<string>[] = [
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

export function PersonPositionsTab({ spaceId }: { spaceId: string }) {
  const [sort, setSort] = React.useState<PositionSort>('new');
  const spaces = useRecordSelection();
  const topics = useRecordSelection();

  const { index, isLoading: isLoadingIndex, isError: isIndexError } = usePersonPositionIndex({ spaceId });

  const selection = React.useMemo(
    () => ({ spaceIds: spaces.values, topicIds: topics.values }),
    [spaces.values, topics.values]
  );

  const facets = React.useMemo(() => narrowedFacets(index, selection), [index, selection]);

  const isFiltered = spaces.values.length > 0 || topics.values.length > 0;

  // Null until the index has landed, so an unfiltered record is never briefly
  // drawn as an empty one — `[]` means "the filters left nothing".
  const matchingIds = React.useMemo(() => {
    if (!isFiltered || isLoadingIndex) return null;
    return matchingEntityIds(index, selection);
  }, [index, isFiltered, isLoadingIndex, selection]);

  // A claim in two spaces must render in the one that satisfied the filter —
  // not whichever the entity lists first, and not a picked space where the
  // topic the reader filtered by was never assigned. `selection` carries both
  // dimensions so the card lands where what they asked for is actually true.
  const preferredSpaceById = React.useMemo(
    () => (isLoadingIndex ? undefined : preferredSpacesFor(index, selection)),
    [index, isLoadingIndex, selection]
  );

  const { rows, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage } = usePersonPositions({
    spaceId,
    sort,
    matchingIds,
    preferredSpaceById,
  });

  // These are this person's spaces, which the viewer has often never opened —
  // the browse sidebar cannot name those.
  const spaceIds = React.useMemo(() => index.spaces.map(facet => facet.id), [index.spaces]);
  const { labelsById } = useSpaceLabels(spaceIds);

  const spaceOptions = React.useMemo(
    () =>
      facets.spaces.map(facet => ({
        value: facet.id,
        label: spaceLabel(labelsById, facet.id)?.name ?? `Space ${facet.id.slice(0, 6)}`,
        count: facet.count,
      })),
    [facets.spaces, labelsById]
  );

  const topicOptions = React.useMemo(
    () =>
      facets.topics.map(facet => ({
        value: facet.id,
        // An unnamed topic is still a real tag on real claims, so it is offered
        // rather than dropped — dropping it would stop the counts in this menu
        // adding up to the list beside it.
        label: facet.name ?? 'Unnamed topic',
        count: facet.count,
      })),
    [facets.topics]
  );

  return (
    <div className="flex flex-col gap-4">
      <RecordFilterRow
        sort={{ value: sort, options: SORT_OPTIONS, onChange: value => setSort(value as PositionSort) }}
        /*
         * Dropped rather than drawn empty when the index could not be read.
         *
         * Both menus are built from it, and the order query they sit above is a
         * separate request — so the index can fail while the claims arrive
         * perfectly well, leaving two menus offering nothing but "Any space" and
         * "Any topic". That reads as a person whose 208 claims are in no space
         * and carry no topic, rather than as a lookup that failed.
         *
         * The same call the Proposals tab makes for its own facets.
         */
        dimensions={
          isIndexError
            ? []
            : [
                {
                  key: 'spaces',
                  options: spaceOptions,
                  values: spaces.values,
                  onToggle: spaces.toggle,
                  onClear: spaces.clear,
                  anyLabel: 'Any space',
                  noun: ['space', 'spaces'],
                  isPending: isLoadingIndex,
                },
                {
                  key: 'topics',
                  options: topicOptions,
                  values: topics.values,
                  onToggle: topics.toggle,
                  onClear: topics.clear,
                  anyLabel: 'Any topic',
                  noun: ['topic', 'topics'],
                  isPending: isLoadingIndex,
                },
              ]
        }
      />

      <PersonRecordFeed
        rows={rows}
        /*
         * The positions query alone. The index only feeds the menus — the claims
         * come from a different request, and `matchingIds` stays null until a
         * filter exists, which it cannot before the menus are drawn.
         *
         * This said as much in a comment while still ORing the index's loading
         * state in, so the first cards waited behind the slowest request on the
         * page: a complete scan of the record.
         */
        isLoading={isLoading}
        isError={isError}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        loadingLabel="Loading positions…"
        // Said differently when the reader narrowed their own way here: an empty
        // result is a statement about the filter, not about the person.
        emptyLabel={isFiltered ? 'No positions match these filters.' : 'No positions on claims yet.'}
        errorLabel="Couldn’t load positions."
        noun="positions"
      />
    </div>
  );
}

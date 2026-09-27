'use client';

import * as React from 'react';

import type { HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { keepSelectableTopics } from '~/core/debates/matchmaking/topic-facets';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import {
  matchingEntityIds,
  narrowedFacets,
  preferredSpacesFor,
  reachableTopicFacets,
  usePersonPositionIndex,
} from '~/core/profile/use-person-position-index';
import {
  DEFAULT_POSITION_SORT,
  type PositionSort,
  usePersonPositions,
  usePersonResponses,
} from '~/core/profile/use-person-positions';

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
  { value: 'best', label: 'Best' },
];

export function PersonPositionsTab({ spaceId }: { spaceId: string }) {
  // Shared with the Activity gallery, which links here — see the constant.
  const [sort, setSort] = React.useState<PositionSort>(DEFAULT_POSITION_SORT);
  const spaces = useRecordSelection();
  const topics = useRecordSelection();

  /*
   * The vote table, read before either of the two things that narrow to it.
   *
   * A retraction is a row rewritten to "neither", not a row removed, so every
   * `votedBy` read — the index behind these menus included — counts claims this
   * person no longer holds a position on. The menus and the list have to narrow
   * to the same set or a topic offers a count the list below it cannot fill.
   *
   * One request: `usePersonPositions` shares this query key.
   */
  const responses = usePersonResponses({ spaceId });

  const {
    index,
    isLoading: isLoadingIndex,
    isError: isIndexError,
  } = usePersonPositionIndex({ spaceId, answeredIds: responses.answeredIds });

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

  // The index is only as settled as the set it was narrowed by, so the menus
  // wait for both. Without this a topic carried only by a retracted claim is
  // offered for as long as the vote read takes, and then disappears.
  const isLoadingFacets = isLoadingIndex || responses.answeredIds === undefined;

  // A claim in two spaces must render in the one that satisfied the filter —
  // not whichever the entity lists first, and not a picked space where the
  // topic the reader filtered by was never assigned. `selection` carries both
  // dimensions so the card lands where what they asked for is actually true.
  const preferredSpaceById = React.useMemo(
    () => (isLoadingIndex ? undefined : preferredSpacesFor(index, selection)),
    [index, isLoadingIndex, selection]
  );

  const { rows, responseByClaimId, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage } =
    usePersonPositions({
      spaceId,
      sort,
      matchingIds,
      preferredSpaceById,
    });

  // These are this person's spaces, which the viewer has often never opened —
  // the browse sidebar cannot name those.
  // This person's own space first, for the response tags: a personal space is
  // named by its Person entity, so this is where "Susan agreed" gets "Susan".
  const spaceIds = React.useMemo(() => [spaceId, ...index.spaces.map(facet => facet.id)], [index.spaces, spaceId]);
  const { labelsById } = useSpaceLabels(spaceIds);
  const personName = spaceLabel(labelsById, spaceId)?.name ?? null;

  const spaceOptions = React.useMemo(
    () =>
      facets.spaces
        // A space the current topics empty is not worth offering — but one the
        // reader has already picked stays, or the only way to un-pick it is the
        // menu's blanket "Any space". Spaces are OR and are not narrowed by
        // themselves, so a selected one reaching zero means a *topic* did it.
        .filter(facet => facet.count > 0 || spaces.values.includes(facet.id))
        .map(facet => ({
          value: facet.id,
          label: spaceLabel(labelsById, facet.id)?.name ?? `Space ${facet.id.slice(0, 6)}`,
          count: facet.count,
        })),
    [facets.spaces, labelsById, spaces.values]
  );

  // Only the topics that lead somewhere — see `reachableTopicFacets`.
  const reachableTopics = React.useMemo(
    () => reachableTopicFacets(facets.topics, topics.values),
    [facets.topics, topics.values]
  );

  const topicOptions = React.useMemo(
    () =>
      reachableTopics.map(facet => ({
        value: facet.id,
        // An unnamed topic is still a real tag on real claims, so it is offered
        // rather than dropped — dropping it would stop the counts in this menu
        // adding up to the list beside it.
        label: facet.name ?? 'Unnamed topic',
        count: facet.count,
      })),
    [reachableTopics]
  );

  /*
   * A topic the menu no longer offers is let go, not held invisibly.
   *
   * The debates hub takes the same line, and its reasoning carries over exactly:
   * a topic is the narrower of the two dimensions, so one the current filter has
   * made unreachable is genuinely gone from the list that offered it — holding
   * it would leave the reader filtered by a chip they cannot see to un-pick.
   * `keepSelectableTopics` drops only the most recent pick when everything would
   * go, so one unlucky choice does not empty the whole selection.
   *
   * Spaces go the other way, above: absence there is a reason to show an empty
   * list, not to revise an input the reader chose.
   */
  const replaceTopics = topics.replace;

  React.useEffect(() => {
    if (isLoadingFacets) return;
    // `replaceTopics` rather than `topics`: the selection object is rebuilt each
    // render, so depending on it would re-run this on every one. The callback is
    // stable, and `replace` keeps the previous array when nothing changed, so
    // this settles rather than chasing its own output.
    replaceTopics(current => keepSelectableTopics(current, reachableTopics, true));
  }, [isLoadingFacets, reachableTopics, replaceTopics]);

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
                  isPending: isLoadingFacets,
                },
                {
                  key: 'topics',
                  options: topicOptions,
                  values: topics.values,
                  onToggle: topics.toggle,
                  onClear: topics.clear,
                  anyLabel: 'Any topic',
                  noun: ['topic', 'topics'],
                  isPending: isLoadingFacets,
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
        responseByClaimId={responseByClaimId}
        personName={personName}
      />
    </div>
  );
}

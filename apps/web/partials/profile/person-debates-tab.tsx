'use client';

import * as React from 'react';

import { FilterSwitch } from '~/core/debates/matchmaking/filter-switch';
import type { HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { usePersonDebates } from '~/core/debates/use-person-debates';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import {
  DEFAULT_DEBATE_SORT,
  type DebateSort,
  filterRowsBySpace,
  sortRows,
  spaceFacetsFromRows,
} from '~/core/profile/record-client-filter';
import { useEntityScores } from '~/core/profile/use-entity-scores';
import { useProfileDebateVisibility } from '~/core/profile/use-profile-debate-visibility';
import { normId } from '~/core/utils/norm-id';

import { PersonRecordFeed } from './person-record-feed';
import { ProfileDebateVisibilityButton } from './profile-debate-visibility-button';
import { RecordFilterRow } from './record-filter-row';
import { useRecordSelection } from './use-record-selection';

/**
 * The debates a person argued (GEO-2859, GEO-2918).
 *
 * Explore cards, not the full-screen player. This is a record being read
 * alongside the rest of a profile, and a viewport-filling swipe feed takes the
 * page over — the same reason Positions renders cards rather than opening the
 * first claim. `DebateExploreFeedCard` still plays the debate in place.
 *
 * Unpaged, and so with nothing to scroll for: the list is bounded by how many
 * debates one person has argued, which is eleven at the top of the graph, and
 * the relation query takes the lot in one request. That is also why its controls
 * act on the array in hand — with the whole record present, doing it locally is
 * exact rather than a compromise.
 *
 * No topic menu here. A debate is not tagged with topics the way a claim is, and
 * a type menu would list `Debate` and nothing else.
 */
/**
 * The default first, then the two alternatives.
 *
 * Old is gone. It was the relation query's order reversed — not a date, since
 * these rows carry none — so it promised "oldest first" and delivered "whatever
 * order the side relations came back in, backwards". A control that cannot keep
 * its promise is worse than one that is missing.
 */
const SORT_OPTIONS: HubFilterOption<string>[] = [
  { value: 'best', label: 'Best' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

/**
 * The two ranked sorts, dropped when the numbers behind them could not be read.
 *
 * An empty map is what both loading and failure look like, and `sortRows` reads
 * it as "keep the incoming order" — so a failed lookup leaves the list in New
 * order under a menu still reading Top. Offering a sort that silently does
 * nothing is worse than offering fewer.
 *
 * Both go together because both come from one request.
 */
const RANKED_SORTS = ['top', 'best'];
const SORT_OPTIONS_UNRANKED = SORT_OPTIONS.filter(option => !RANKED_SORTS.includes(option.value));

const isRanked = (sort: DebateSort) => sort === 'top' || sort === 'best';

export function PersonDebatesTab({
  spaceId,
  showHiddenInitially = false,
}: {
  spaceId: string;
  showHiddenInitially?: boolean;
}) {
  // Shared with the Activity gallery, which links here — see the constant.
  const [sort, setSort] = React.useState<DebateSort>(DEFAULT_DEBATE_SORT);
  const spaces = useRecordSelection();

  const { personalSpaceId } = usePersonalSpaceId();
  const isOwner = Boolean(personalSpaceId && ID.equals(personalSpaceId, spaceId));
  const { rows, hiddenRows, hiddenRelationsByDebateId, isLoading, isError } = usePersonDebates(spaceId, true);
  const visibility = useProfileDebateVisibility(spaceId);
  const [showHidden, setShowHidden] = React.useState(showHiddenInitially);

  React.useEffect(() => {
    // Preserve a deep link while its rows are still loading. Once the request
    // settles, fall back to the public list if there is nothing hidden.
    if (!isLoading && hiddenRows.length === 0) setShowHidden(false);
  }, [hiddenRows.length, isLoading]);

  const sourceRows = showHidden ? hiddenRows : rows;

  const facets = React.useMemo(() => spaceFacetsFromRows(sourceRows), [sourceRows]);

  // Only asked for when a ranked sort is showing, which by default it is. The
  // card carries neither number — Explore ranks by ordering rows server-side
  // rather than decorating them — so a list already complete in memory has to
  // look them up to rank itself.
  const debateIds = React.useMemo(() => sourceRows.map(row => row.entityId), [sourceRows]);
  const {
    scores,
    rankings,
    isLoading: isLoadingRanks,
    isError: isScoresError,
  } = useEntityScores({ ids: debateIds, enabled: isRanked(sort) });

  // The order the menu is claiming. With the ranked sorts withdrawn, that is New
  // — not Top quietly behaving like New.
  const effectiveSort = isScoresError && isRanked(sort) ? 'new' : sort;

  const ranks = React.useMemo(() => ({ scores, rankings }), [rankings, scores]);

  const shown = React.useMemo(
    () => sortRows(filterRowsBySpace(sourceRows, spaces.values), effectiveSort, ranks),
    [effectiveSort, ranks, sourceRows, spaces.values]
  );

  const spaceIds = React.useMemo(() => facets.map(facet => facet.id), [facets]);
  const { labelsById } = useSpaceLabels(spaceIds);

  const spaceOptions = React.useMemo(
    () =>
      facets.map(facet => ({
        value: facet.id,
        label: spaceLabel(labelsById, facet.id)?.name ?? `Space ${facet.id.slice(0, 6)}`,
        count: facet.count,
      })),
    [facets, labelsById]
  );

  const isFiltered = spaces.values.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/*
       * Above every state, the empty one included. An empty list is usually the
       * filter's doing, and the menu that caused it is the only way back —
       * unmounting the controls along with the rows is a dead end.
       *
       * Hidden when there is nothing to control: ten of this account's eleven
       * debates sit in one space, and a menu with a single row cannot act.
       */}
      {isOwner && hiddenRows.length > 0 ? (
        <div className="flex justify-end">
          <FilterSwitch
            label={`Show hidden (${hiddenRows.length})`}
            checked={showHidden}
            onChange={next => {
              spaces.clear();
              setShowHidden(next);
            }}
          />
        </div>
      ) : null}

      {facets.length > 1 || sourceRows.length > 1 ? (
        <RecordFilterRow
          sort={{
            // Falls back to New rather than stranding the reader on a sort that
            // is no longer offered.
            value: effectiveSort,
            options: isScoresError ? SORT_OPTIONS_UNRANKED : SORT_OPTIONS,
            onChange: value => setSort(value as DebateSort),
          }}
          dimensions={
            facets.length > 1
              ? [
                  {
                    key: 'spaces',
                    options: spaceOptions,
                    values: spaces.values,
                    onToggle: spaces.toggle,
                    onClear: spaces.clear,
                    anyLabel: 'Any space',
                    noun: ['space', 'spaces'],
                  },
                ]
              : []
          }
        />
      ) : null}

      <PersonRecordFeed
        rows={shown}
        /*
         * The ranks are part of loading now that a ranked sort is the default.
         *
         * `sortRows` reads an absent rank as "keep the incoming order", so
         * without this the list paints in relation order and visibly reshuffles
         * a moment later — on every load rather than on a click, which is what
         * made it worth the extra beat. The lookup is one request for at most
         * eleven ids and only runs once the rows it needs have arrived.
         */
        isLoading={isLoading || (isRanked(effectiveSort) && isLoadingRanks)}
        isError={isError}
        loadingLabel="Loading debates…"
        // Said here rather than by the browse feed, which offers "Start one from
        // the Claims tab" — right for a space with no debates in it, wrong for a
        // person who has never been in one.
        emptyLabel={
          isFiltered ? 'No debates match these filters.' : showHidden ? 'No hidden debates.' : 'No debates yet.'
        }
        errorLabel="Couldn’t load debates."
        noun="debates"
        debateEndSlot={
          isOwner
            ? item => {
                const id = normId(item.entityId);
                const hidden = hiddenRelationsByDebateId.get(id) ?? [];
                return (
                  <ProfileDebateVisibilityButton
                    hidden={showHidden}
                    pending={visibility.pendingIds.has(id)}
                    onClick={() => void visibility.setHidden(item, hidden, !showHidden)}
                  />
                );
              }
            : undefined
        }
      />
    </div>
  );
}

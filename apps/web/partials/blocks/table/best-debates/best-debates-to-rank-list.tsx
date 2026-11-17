'use client';

import * as React from 'react';

import { MATCHING_DEBATES_CAP, type RecentDebate } from '~/core/blocks/ranking/best-debates-debates';
import { type RecordedFilter, recordedPhrase } from '~/core/blocks/ranking/best-debates-ranking-filters';
import { filterTeamIds } from '~/core/blocks/ranking/best-debates-team-filters';
import type { RankersRead } from '~/core/blocks/ranking/use-best-debates-to-rank';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { normId } from '~/core/utils/norm-id';

import { rankingEntityDragProps } from '../ranking-entity-drag';
import { BestDebateDisplaysContext, BestDebateWatchContext } from './best-debate-row';
import { BestDebatesGroupedRows, BestDebatesTeamRowContent } from './best-debates-team-row';

type Props = {
  debates: RecentDebate[];
  isLoading: boolean;
  error: Error | null;
  rankers: RankersRead;
  entriesById: Map<string, RankingEntryDisplay>;
  onPlace: (entityId: string) => void;
  /** Rows can be dragged into "Your ranking" (desktop). */
  draggable: boolean;
  /** The team column's search, applied to this list too. */
  query?: string;
  topicIds?: readonly string[];
  groupBySpace?: boolean;
  /** Push a debate down from its row. */
  onPushDown?: (entityId: string) => void;
  /** The screen's recorded filter (GEO-3774): the list covers its range instead of the last 7 days. */
  recorded?: RecordedFilter | null;
  todayKey?: string;
  /** A recorded, debater or claim filter is on. */
  filtered?: boolean;
  /** The filtered read stopped at its cap. */
  capped?: boolean;
};

/**
 * To rank (GEO-3678): the last 7 days' debates the ranker hasn't placed, nobody-ranked first, each saying
 * who has ranked it, so the team can spread out. A tap on a row opens it to watch, and Rank places it by
 * comparison; on a desktop a row
 * can also be dragged straight into the ranking. There is no skip: the window empties itself.
 */
export function BestDebatesToRankList({
  debates,
  isLoading,
  error,
  rankers,
  entriesById,
  onPlace,
  draggable,
  query = '',
  topicIds = NO_TOPICS,
  groupBySpace = false,
  onPushDown,
  recorded = null,
  todayKey = '',
  filtered = false,
  capped = false,
}: Props) {
  const displays = React.useContext(BestDebateDisplaysContext);
  const watch = React.useContext(BestDebateWatchContext);
  if (isLoading) return <p className="py-3 text-metadata text-grey-04">Loading debates…</p>;
  if (error) {
    return (
      <p className="py-3 text-metadata text-grey-04">
        {filtered ? 'Couldn’t load these debates.' : 'Couldn’t load this week’s debates.'}
      </p>
    );
  }
  if (debates.length === 0) {
    return (
      <p className="py-3 text-metadata text-grey-04">
        {filtered ? 'Nothing left to rank with these filters.' : 'You’re up to date.'}
      </p>
    );
  }

  const byId = new Map(debates.map(debate => [debate.entityId, debate]));
  const nameOf = (id: string) => entriesById.get(id)?.name ?? byId.get(id)?.name ?? null;
  const ids = filterTeamIds(
    debates.map(debate => debate.entityId),
    id => displays?.get(normId(id)),
    { query, topicIds },
    nameOf
  );

  const row = (entityId: string) => {
    const debate = byId.get(entityId);
    if (!debate) return null;
    const name = nameOf(entityId) ?? 'Untitled debate';
    return (
      // A press on the row opens the debate to watch (Preston, 13 Nov). The row isn't a button, so
      // its Rank, Down rank and poster (Watch) controls stay reachable to keyboards and screen readers.
      <div
        key={entityId}
        data-testid="best-debates-to-rank-row"
        className="flex w-full cursor-pointer items-center py-3 text-left"
        onClick={() => watch?.(entityId, 'row')}
        {...(draggable ? rankingEntityDragProps(entityId) : {})}
      >
        <BestDebatesTeamRowContent
          entityId={entityId}
          name={name}
          spaceId={debate.spaceId}
          rankers={rankers}
          myRank={null}
          draggable={draggable}
          onPushDown={onPushDown ? () => onPushDown(entityId) : undefined}
          onRank={() => onPlace(entityId)}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col" data-testid="best-debates-to-rank">
      <p className="m-0 pb-2 text-metadata text-grey-04 md:pt-1 md:text-footnote">
        {recorded
          ? `Recorded ${recordedPhrase(recorded, todayKey)} and not in your ranking, nobody-ranked first.`
          : 'Published in the last 7 days and not in your ranking, nobody-ranked first. Anything older drops off.'}
        {capped ? ` Showing the first ${MATCHING_DEBATES_CAP}.` : null}
      </p>
      {ids.length === 0 ? (
        <p className="py-3 text-metadata text-grey-04">No debates match.</p>
      ) : (
        <BestDebatesGroupedRows ids={ids} grouped={groupBySpace} render={row} />
      )}
    </div>
  );
}

const NO_TOPICS: readonly string[] = [];

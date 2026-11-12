'use client';

import * as React from 'react';

import type { RecentDebate } from '~/core/blocks/ranking/best-debates-debates';
import { type RankersRead, rankedByLabel, rankedByText } from '~/core/blocks/ranking/use-best-debates-to-rank';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';

import { RankingChart } from '~/design-system/icons/ranking-chart';

import { rankingEntityDragProps } from '../ranking-entity-drag';
import { RankingEntryRow } from '../ranking-entry-row';

type Props = {
  debates: RecentDebate[];
  isLoading: boolean;
  error: Error | null;
  rankers: RankersRead;
  entriesById: Map<string, RankingEntryDisplay>;
  onPlace: (entityId: string) => void;
  /** Rows can be dragged into "Your ranking" (desktop). */
  draggable: boolean;
};

function RankedByBadge({ rankers, entityId }: { rankers: RankersRead; entityId: string }) {
  const label = rankedByLabel(rankers, entityId);
  if (label.kind === 'unknown') return null;
  if (label.kind === 'nobody') {
    return (
      <span className="inline-flex h-5 items-center rounded-[4px] bg-purple-tint px-1.5 text-[12px] leading-[13px] whitespace-nowrap text-purple">
        Nobody has ranked this yet
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center rounded-[4px] bg-grey-01 px-1.5 text-[12px] leading-[13px] whitespace-nowrap text-grey-04">
      {rankedByText(label)}
    </span>
  );
}

/** The drag handle the mockups draw on a row that can go into "Your ranking". */
const GRIP = (
  <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden className="shrink-0 text-grey-03">
    <g fill="currentColor">
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="13" r="1.2" />
      <circle cx="7" cy="13" r="1.2" />
    </g>
  </svg>
);

/**
 * To rank (GEO-3678): the last 7 days' debates the ranker hasn't placed, nobody-ranked first, each saying
 * who has ranked it, so the team can spread out. A tap places one by comparison; on a desktop a row
 * can also be dragged straight into the ranking. There is no skip: the window empties itself.
 */
export function BestDebatesToRankList({ debates, isLoading, error, rankers, entriesById, onPlace, draggable }: Props) {
  if (isLoading) return <p className="py-3 text-metadata text-grey-04">Loading debates…</p>;
  if (error) return <p className="py-3 text-metadata text-grey-04">Couldn’t load this week’s debates.</p>;
  if (debates.length === 0) return <p className="py-3 text-metadata text-grey-04">You’re up to date.</p>;

  return (
    <div className="flex flex-col" data-testid="best-debates-to-rank">
      <p className="m-0 pb-2 text-metadata text-grey-04">
        Published in the last 7 days and not in your ranking, nobody-ranked first. Anything older drops off.
      </p>
      {debates.map(debate => {
        const entry = entriesById.get(debate.entityId);
        const name = entry?.name ?? debate.name ?? 'Untitled debate';
        return (
          <div
            key={debate.entityId}
            role="button"
            tabIndex={0}
            aria-label={`Rank ${name}`}
            className="flex w-full cursor-pointer items-center gap-3 py-3 text-left"
            onClick={() => onPlace(debate.entityId)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPlace(debate.entityId);
              }
            }}
            {...(draggable ? rankingEntityDragProps(debate.entityId) : {})}
          >
            {draggable ? GRIP : null}
            <RankingEntryRow
              rankStyle="leading"
              linkToEntity={false}
              actions={
                <div className="flex">
                  <RankedByBadge rankers={rankers} entityId={debate.entityId} />
                </div>
              }
              debateAside={
                <span
                  className="grid size-8 place-items-center rounded-md border border-grey-02 bg-white text-text"
                  aria-hidden
                >
                  <RankingChart />
                </span>
              }
              entry={{
                entityId: debate.entityId,
                name,
                description: entry?.description ?? null,
                image: entry?.image ?? null,
              }}
              spaceId={debate.spaceId}
            />
          </div>
        );
      })}
    </div>
  );
}

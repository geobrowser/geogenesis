'use client';

import * as React from 'react';

import type { RecentDebate } from '~/core/blocks/ranking/best-debates-debates';
import { type RankersRead, rankedByLabel, rankedByText } from '~/core/blocks/ranking/use-best-debates-to-rank';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';

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
      <span className="inline-flex rounded-full bg-grey-01 px-2 py-0.5 text-footnoteMedium text-text">
        Nobody has ranked this yet
      </span>
    );
  }
  return <span className="text-footnote text-grey-04">{rankedByText(label)}</span>;
}

/**
 * To rank (GEO-3678): the last 7 days' debates the ranker hasn't placed, newest first, each saying
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
        Published in the last 7 days and not in your ranking. Anything older drops off.
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
            className="flex w-full cursor-pointer flex-col gap-1 py-3 text-left"
            onClick={() => onPlace(debate.entityId)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPlace(debate.entityId);
              }
            }}
            {...(draggable ? rankingEntityDragProps(debate.entityId) : {})}
          >
            <RankingEntryRow
              rankStyle="leading"
              linkToEntity={false}
              entry={{
                entityId: debate.entityId,
                name,
                description: entry?.description ?? null,
                image: entry?.image ?? null,
              }}
              spaceId={debate.spaceId}
            />
            <div className="pl-2">
              <RankedByBadge rankers={rankers} entityId={debate.entityId} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

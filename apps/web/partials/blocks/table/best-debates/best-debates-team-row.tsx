'use client';

import * as React from 'react';

import { type SpaceGroup, groupBySpace } from '~/core/blocks/ranking/best-debates-team-filters';
import { type RankersRead, rankedByLabel, rankedByText } from '~/core/blocks/ranking/use-best-debates-to-rank';
import { normId } from '~/core/utils/norm-id';

import { RankingChart } from '~/design-system/icons/ranking-chart';

import { SpaceThumb } from '~/partials/explore/space-thumb';

import { RankingEntryRow } from '../ranking-entry-row';
import { BestDebateDisplaysContext } from './best-debate-row';

/** Who has ranked a debate: the purple "Nobody has ranked this yet", or "Ranked by …". */
export function RankedByBadge({ rankers, entityId }: { rankers: RankersRead; entityId: string }) {
  const label = rankedByLabel(rankers, entityId);
  if (label.kind === 'unknown') return null;
  if (label.kind === 'nobody') {
    return (
      <span className="inline-flex h-5 items-center rounded-[4px] bg-purple-tint px-1.5 text-tag whitespace-nowrap text-purple">
        Nobody has ranked this yet
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center rounded-[4px] bg-grey-01 px-1.5 text-tag whitespace-nowrap text-grey-04">
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

/** The red down arrow Push it down has always had. */
function PushDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-red-01">
      <path d="M8 2.5v9M4.5 8L8 11.5 11.5 8M3 13.5h10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * One row of the team column, the same in All and To rank (mockups 07 and 08): the grip where it
 * can be dragged, the team place in All, the poster, claim and meta, who has ranked it, and on the
 * right either "You: #N" or the rank mark. The row itself is the button that places it.
 */
export function BestDebatesTeamRowContent({
  entityId,
  name,
  spaceId,
  rank,
  rankers,
  myRank,
  draggable,
  onPushDown,
}: {
  entityId: string;
  name: string;
  spaceId: string;
  rank?: number;
  rankers: RankersRead;
  /** The debate's place in your ranking, when it's there. */
  myRank: number | null;
  draggable: boolean;
  /** Push it down from the row (Preston, 12 Nov), beside the rank mark. */
  onPushDown?: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-3" data-testid="best-debates-team-row">
      {draggable && !myRank ? GRIP : draggable ? <span className="w-2.5 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        <RankingEntryRow
          rank={rank}
          rankStyle="leading"
          linkToEntity={false}
          entry={{ entityId, name, description: null, image: null }}
          spaceId={spaceId}
          actions={
            <div className="flex">
              <RankedByBadge rankers={rankers} entityId={entityId} />
            </div>
          }
          // Rank mark first, then Push it down to its right (Preston, 12 Nov).
          debateAside={
            myRank ? (
              <span className="text-breadcrumb whitespace-nowrap text-grey-04 tabular-nums">You: #{myRank}</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span
                  className="grid size-8 place-items-center rounded-md border border-grey-02 bg-white text-text md:size-11"
                  aria-hidden
                >
                  <RankingChart />
                </span>
                {onPushDown ? (
                  <button
                    type="button"
                    aria-label={`Push ${name} down`}
                    title="Push it down"
                    onClick={event => {
                      event.stopPropagation();
                      onPushDown();
                    }}
                    onKeyDown={event => event.stopPropagation()}
                    className="grid size-8 place-items-center rounded-md border border-grey-02 bg-white transition-colors hover:border-text md:size-11"
                  >
                    <PushDownIcon />
                  </button>
                ) : null}
              </span>
            )
          }
        />
      </div>
    </div>
  );
}

/** A space's section in the team column when it is grouped by space. */
export function SpaceGroupHeader({ group }: { group: SpaceGroup }) {
  const name = group.space?.name ?? 'Other';
  return (
    <div className="flex items-center gap-2 pt-4 pb-1 text-footnoteMedium text-grey-04">
      {group.space ? <SpaceThumb image={group.space.image} name={name} /> : null}
      <span className="whitespace-nowrap">
        {name} · {group.ids.length}
      </span>
      <span className="h-px flex-1 bg-grey-02" aria-hidden />
    </div>
  );
}

/**
 * Draws `ids` with `render`, grouped by space when asked: a header per space, rows in their order
 * inside it, and no header for a space with nothing left in it.
 */
export function BestDebatesGroupedRows({
  ids,
  grouped,
  render,
}: {
  ids: readonly string[];
  grouped: boolean;
  render: (entityId: string) => React.ReactNode;
}) {
  const displays = React.useContext(BestDebateDisplaysContext);
  if (!grouped || !displays) return <>{ids.map(render)}</>;
  const groups = groupBySpace(ids, id => displays.get(normId(id)));
  return (
    <>
      {groups.map(group => (
        <section key={group.space?.id ?? 'other'} aria-label={group.space?.name ?? 'Other'} data-testid="space-group">
          <SpaceGroupHeader group={group} />
          {group.ids.map(render)}
        </section>
      ))}
    </>
  );
}

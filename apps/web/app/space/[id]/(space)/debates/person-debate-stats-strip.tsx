'use client';

import cx from 'classnames';

import type { PersonDebateStats } from '~/core/debates/person-debate-stats';

import { Skeleton } from '~/design-system/skeleton';

type Props = {
  stats: PersonDebateStats;
  isWinRateLoading: boolean;
};

/**
 * The four figures over a person's Debates tab: Claims, Debates, Won, Spaces.
 */
export function PersonDebateStatsStrip({ stats, isWinRateLoading }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 @[520px]:grid-cols-4">
      <StatCell label="Claims" value={String(stats.claims)} />
      <StatCell label="Debates" value={String(stats.debates)} />
      <StatCell
        label="Won"
        loading={isWinRateLoading}
        value={stats.winRate ? `${stats.winRate.percent}%` : '—'}
        sub={
          stats.winRate
            ? `${stats.winRate.wins} of the ${stats.winRate.judged} that were voted on`
            : isWinRateLoading
              ? undefined
              : 'None voted on yet'
        }
      />
      <StatCell label="Spaces" value={String(stats.spaceIds.length)} />
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  loading = false,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-grey-02 px-3 py-4 text-center'
      )}
    >
      {loading ? <Skeleton className="h-[1.375rem] w-12" /> : <p className="text-mediumTitle tabular-nums">{value}</p>}
      <p className="text-metadata text-grey-04">{label}</p>
      {sub ? <p className="text-footnote text-grey-04">{sub}</p> : null}
    </div>
  );
}

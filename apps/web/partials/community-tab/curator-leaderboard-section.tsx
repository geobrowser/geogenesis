'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import type {
  CuratorLeaderboardMetrics,
  CuratorLeaderboardPeriod,
  CuratorLeaderboardResult,
  CuratorLeaderboardRow,
} from '~/core/community/curator-leaderboard-types';
import {
  CURATOR_LEADERBOARD_MAX_ROWS,
  CURATOR_LEADERBOARD_PERIOD_OPTIONS,
} from '~/core/community/curator-leaderboard-types';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { FILTER_PILL_CLASS, SingleSelectPill } from './community-filter-pill';

type Props = {
  spaceId: string;
  initialData?: CuratorLeaderboardResult;
};

const DEFAULT_PERIOD: CuratorLeaderboardPeriod = 'week';

const EMPTY_METRICS: CuratorLeaderboardMetrics = { activeCurators: 0, rankings: 0, newsStories: 0 };

const INK = 'text-[#2A2B2E]';

const METRIC_COUNT_CLASS = 'text-[19px] leading-[21px] font-semibold tracking-[-0.35px] tabular-nums';
const METRIC_LABEL_CLASS = 'text-[16px] leading-[21px] font-medium tracking-[-0.35px]';

const CELL_TEXT_CLASS = 'text-[16px] leading-[13px] font-medium tracking-[-0.35px]';
const CELL_PADDING_CLASS = 'px-4 py-3';

const METRIC_CARD_HEIGHT_PX = 45;

const METRIC_CARD_STYLE = {
  height: METRIC_CARD_HEIGHT_PX,
  minHeight: METRIC_CARD_HEIGHT_PX,
  maxHeight: METRIC_CARD_HEIGHT_PX,
} as const satisfies React.CSSProperties;

type ColumnAlignment = 'left' | 'center';

const LEADERBOARD_COLUMNS: { key: string; label: string; align: ColumnAlignment }[] = [
  { key: 'rank', label: 'Rank', align: 'left' },
  { key: 'curator', label: 'Curator', align: 'left' },
  { key: 'rankings', label: 'Rankings', align: 'center' },
  { key: 'newsStories', label: 'News stories', align: 'center' },
  { key: 'votes', label: 'Votes', align: 'center' },
  { key: 'submissions', label: 'Submissions', align: 'center' },
];

function MetricCard({ label, value, isLoading }: { label: string; value: number; isLoading: boolean }) {
  return (
    <div
      style={METRIC_CARD_STYLE}
      className={cx(
        'box-border flex min-w-0 flex-1 basis-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-grey-02 bg-white px-5 py-3',
        INK
      )}
    >
      <span className={METRIC_LABEL_CLASS}>{label}</span>
      {isLoading ? <Skeleton className="h-[21px] w-8 rounded" /> : <span className={METRIC_COUNT_CLASS}>{value}</span>}
    </div>
  );
}

function LeaderboardMetrics({ metrics, isLoading }: { metrics: CuratorLeaderboardMetrics; isLoading: boolean }) {
  return (
    <div className="flex w-full gap-4">
      <MetricCard label="Active curators" value={metrics.activeCurators} isLoading={isLoading} />
      <MetricCard label="Rankings" value={metrics.rankings} isLoading={isLoading} />
      <MetricCard label="News stories" value={metrics.newsStories} isLoading={isLoading} />
    </div>
  );
}

function CuratorCell({ row }: { row: CuratorLeaderboardRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative size-8 shrink-0 overflow-hidden rounded-full">
        <Avatar value={row.curatorSpaceId} avatarUrl={row.avatarUrl} alt={row.name} size={32} />
      </div>
      <Link
        href={NavUtils.toSpace(row.curatorSpaceId)}
        title={row.name}
        className={cx('min-w-0 truncate hover:underline', CELL_TEXT_CLASS, INK)}
      >
        {row.isCurrentUser ? 'You' : row.name}
      </Link>
    </div>
  );
}

function NumberCell({ value, colorClass = INK }: { value: number; colorClass?: string }) {
  return <td className={cx(CELL_PADDING_CLASS, CELL_TEXT_CLASS, 'text-center tabular-nums', colorClass)}>{value}</td>;
}

function LeaderboardTableRow({ row, showTopBorder = false }: { row: CuratorLeaderboardRow; showTopBorder?: boolean }) {
  return (
    <tr className={cx('bg-white', showTopBorder && 'border-t border-grey-02')}>
      <td className={cx(CELL_PADDING_CLASS, CELL_TEXT_CLASS, 'text-left tabular-nums', INK)}>{row.rank}</td>
      <td className={cx(CELL_PADDING_CLASS, 'text-left')}>
        <CuratorCell row={row} />
      </td>
      <NumberCell value={row.rankings} />
      <NumberCell value={row.newsStories} />
      <NumberCell value={row.votes} />
      <NumberCell value={row.submissions} colorClass={row.submissions === 0 ? 'text-grey-04' : INK} />
    </tr>
  );
}

function LeaderboardTable({
  rows,
  currentUserRow,
  isLoading,
}: {
  rows: CuratorLeaderboardRow[];
  currentUserRow: CuratorLeaderboardRow | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-grey-02">
        <div className="space-y-3 bg-white p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  const showCurrentUserRow = currentUserRow && !rows.some(row => row.curatorSpaceId === currentUserRow.curatorSpaceId);

  const isTruncated = rows.length >= CURATOR_LEADERBOARD_MAX_ROWS;

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-grey-01">
            {LEADERBOARD_COLUMNS.map(column => (
              <th
                key={column.key}
                className={cx(
                  'px-4 py-3 text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-grey-04',
                  column.align === 'left' ? 'text-left' : 'text-center'
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="bg-white">
              <td
                colSpan={LEADERBOARD_COLUMNS.length}
                className="px-4 py-8 text-center text-[16px] leading-[20px] text-grey-04"
              >
                No curator activity in this period yet.
              </td>
            </tr>
          ) : (
            rows.map(row => <LeaderboardTableRow key={row.curatorSpaceId} row={row} />)
          )}
          {showCurrentUserRow ? <LeaderboardTableRow row={currentUserRow} showTopBorder={isTruncated} /> : null}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-grey-02 bg-white px-4 py-8 text-center text-[16px] leading-[20px] text-grey-04">
      Could not load the curator leaderboard.
      <div className="mt-3 flex justify-center">
        <button type="button" onClick={onRetry} className={FILTER_PILL_CLASS}>
          Try again
        </button>
      </div>
    </div>
  );
}

function IncompleteCountsNotice() {
  return <p className="text-[16px] leading-[20px] text-grey-04">Some activity was not included in these counts.</p>;
}

export function CuratorLeaderboardSection({ spaceId, initialData }: Props) {
  const [period, setPeriod] = React.useState<CuratorLeaderboardPeriod>(initialData?.period ?? DEFAULT_PERIOD);
  const { personalSpaceId } = usePersonalSpaceId();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['curator-leaderboard', spaceId, period, personalSpaceId],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (personalSpaceId) params.set('currentUserSpaceId', personalSpaceId);
      const response = await fetch(`/api/space/${spaceId}/curator-leaderboard?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load curator leaderboard');
      return (await response.json()) as CuratorLeaderboardResult;
    },
    initialData: initialData && period === initialData.period ? initialData : undefined,
    staleTime: 60_000,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 8000),
  });

  const metrics = data?.metrics ?? EMPTY_METRICS;
  const rows = data?.rows ?? [];
  const currentUserRow = data?.currentUserRow ?? null;
  const truncated = data?.truncated ?? false;
  const isLoading = isPending;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className={cx('text-[24px] leading-[29px] font-semibold tracking-[-0.75px]', INK)}>Curator leaderboard</h2>
        <SingleSelectPill
          value={period}
          options={CURATOR_LEADERBOARD_PERIOD_OPTIONS}
          onChange={setPeriod}
          contentClassName="max-w-[180px]"
        />
      </div>

      {isError ? (
        <LeaderboardError onRetry={() => void refetch()} />
      ) : (
        <>
          <LeaderboardMetrics metrics={metrics} isLoading={isLoading} />

          <LeaderboardTable rows={rows} currentUserRow={currentUserRow} isLoading={isLoading} />

          {truncated && !isLoading ? <IncompleteCountsNotice /> : null}
        </>
      )}
    </section>
  );
}

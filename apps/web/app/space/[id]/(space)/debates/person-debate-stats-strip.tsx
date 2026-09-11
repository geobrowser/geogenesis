'use client';

import * as React from 'react';

import cx from 'classnames';

import type { PersonDebateStats } from '~/core/debates/person-debate-stats';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { Menu, MenuItem } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

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
      />
      <SpacesCell spaceIds={stats.spaceIds} />
    </div>
  );
}

const cellClasses =
  'flex flex-col items-center justify-center gap-1 rounded-lg border border-grey-02 px-3 py-4 text-center';

function StatCell({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className={cellClasses}>
      {loading ? <Skeleton className="h-[1.375rem] w-12" /> : <p className="text-mediumTitle tabular-nums">{value}</p>}
      <p className="text-metadata text-grey-04">{label}</p>
    </div>
  );
}

function SpacesCell({ spaceIds }: { spaceIds: string[] }) {
  const [open, setOpen] = React.useState(false);
  const { labelsById, isLoading } = useSpaceLabels(spaceIds);

  if (spaceIds.length === 0) {
    return <StatCell label="Spaces" value="0" />;
  }

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      className="max-w-[280px]"
      trigger={
        <button type="button" className={cx(cellClasses, 'cursor-pointer transition-colors hover:border-grey-03')}>
          <p className="text-mediumTitle tabular-nums">{spaceIds.length}</p>
          <p className="text-metadata text-grey-04">Spaces</p>
          <div className="flex -space-x-1.5">
            {spaceIds.slice(0, 4).map(id => (
              <SpaceIcon
                key={id}
                label={spaceLabel(labelsById, id)}
                pending={!spaceLabel(labelsById, id) && isLoading}
                bordered
              />
            ))}
          </div>
        </button>
      }
    >
      <>
        {spaceIds.map(id => {
          const label = spaceLabel(labelsById, id);
          const pending = !label && isLoading;
          return (
            <MenuItem key={id} href={NavUtils.toSpace(id)} onClick={() => setOpen(false)}>
              <SpaceIcon label={label} pending={pending} size={16} />
              {pending ? (
                <Skeleton className="h-[1em] max-w-[140px] flex-1" aria-label="Loading space name" />
              ) : (
                <Text variant="metadataMedium" className="truncate">
                  {label?.name ?? 'Space'}
                </Text>
              )}
            </MenuItem>
          );
        })}
      </>
    </Menu>
  );
}

function SpaceIcon({
  label,
  pending,
  size = 20,
  bordered = false,
}: {
  label: { name: string; image: string | null } | undefined;
  pending: boolean;
  size?: number;
  bordered?: boolean;
}) {
  const box = { width: size, height: size };
  const ring = bordered ? 'ring-2 ring-white' : '';

  if (pending) {
    return <Skeleton className={cx('shrink-0 rounded-md', ring)} style={box} />;
  }

  if (label?.image) {
    return (
      <span className={cx('relative shrink-0 overflow-hidden rounded-md', ring)} style={box}>
        <ThumbGeoImage value={label.image} alt="" />
      </span>
    );
  }

  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04',
        ring
      )}
      style={box}
    >
      {((label?.name ?? '').trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
    </span>
  );
}

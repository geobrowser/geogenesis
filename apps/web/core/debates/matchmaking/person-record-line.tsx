'use client';

import * as React from 'react';

import { InfoSmall } from '~/design-system/icons/info-small';
import { Megaphone } from '~/design-system/icons/megaphone';
import { Text } from '~/design-system/text';

import { Crown } from '../browse/icons';
import { type PersonRecord, formatJoinedAt } from './person-record';

const ICON_SIZE = 13;

/**
 * One stat: an icon, a count, and a label only a screen reader hears.
 *
 * `whitespace-nowrap` keeps each stat a single unbreakable unit, so a row too narrow for all three
 * wraps *between* stats rather than through the middle of one. An icon beside a bare number is only
 * legible to someone who already knows the icon, so every stat carries real label text — `title`
 * alone would leave the row as two unexplained numbers to a screen reader.
 */
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-browseSection whitespace-nowrap text-grey-04">
      <span className="shrink-0 text-grey-04" aria-hidden>
        {icon}
      </span>
      <span className="text-text tabular-nums" aria-hidden>
        {value}
      </span>
      <span className="sr-only">{label}</span>
    </li>
  );
}

/**
 * Someone's debating record, under their name on a People row.
 *
 * Every stat is omitted when absent rather than rendered as zero — "0 debates · 0% won" reads as
 * failure where absence reads as new — so this returns just the join date for someone who has not
 * started yet, and nothing at all for someone we know nothing about.
 */
export function PersonRecordLine({ record }: { record: PersonRecord }) {
  const { positions, debatesArgued, winRate, joinedAt } = record;
  const hasStats = positions !== null || debatesArgued !== null || winRate !== null;

  if (!hasStats && !joinedAt) return null;

  return (
    <>
      {hasStats && (
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-0.5 p-0">
          {positions !== null && (
            <Stat
              icon={<InfoSmall size={ICON_SIZE} />}
              value={String(positions)}
              label={`${positions} ${positions === 1 ? 'position' : 'positions'}`}
            />
          )}
          {debatesArgued !== null && (
            <Stat
              icon={<Megaphone size={ICON_SIZE} />}
              value={String(debatesArgued)}
              label={`${debatesArgued} ${debatesArgued === 1 ? 'debate' : 'debates'}`}
            />
          )}
          {winRate !== null && (
            <Stat
              icon={<Crown size={ICON_SIZE} variant="outline" />}
              value={`${winRate.percent}%`}
              label={`Won ${winRate.wins} of ${winRate.of} ${winRate.of === 1 ? 'debate' : 'debates'}`}
            />
          )}
        </ul>
      )}
      {joinedAt && (
        <Text as="p" variant="footnote" color="grey-04">
          On Geo since {formatJoinedAt(joinedAt)}
        </Text>
      )}
    </>
  );
}

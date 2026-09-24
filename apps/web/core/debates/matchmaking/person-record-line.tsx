'use client';

import * as React from 'react';

import { Megaphone } from '~/design-system/icons/megaphone';
import { Warning } from '~/design-system/icons/warning';
import { Text } from '~/design-system/text';

import { type PersonRecord, formatJoinedAt } from './person-record';

const ICON_SIZE = 13;

/**
 * One stat: an icon, a count, and a label only a screen reader hears.
 *
 * `whitespace-nowrap` keeps each stat a single unbreakable unit, so a row too narrow for both
 * wraps *between* stats rather than through the middle of one. An icon beside a bare number is only
 * legible to someone who already knows the icon, so every stat carries real label text — `title`
 * alone would leave the row as two unexplained numbers to a screen reader.
 *
 * The same text also rides on the hidden half as a `title`, so a pointer can reach what a screen
 * reader is already told. It sits on the `aria-hidden` spans rather than the item, where assistive
 * technology would read it a second time alongside the label.
 */
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-browseSection whitespace-nowrap text-grey-04">
      <span className="shrink-0 text-grey-04" title={label} aria-hidden>
        {icon}
      </span>
      <span className="text-text tabular-nums" title={label} aria-hidden>
        {value}
      </span>
      <span className="sr-only">{label}</span>
    </li>
  );
}

/**
 * Someone's debating record, under their name on a People row.
 *
 * Every stat is omitted when absent rather than rendered as zero, so this returns just the join
 * date for someone who has not started yet, and nothing at all for someone we know nothing about.
 * Win rate is deliberately absent: this row is for activity and shared disagreement context, not
 * a competitive leaderboard.
 */
export function PersonRecordLine({
  record,
  disagreement,
  activeSpaces,
}: {
  record: PersonRecord | null;
  disagreement?: React.ReactNode;
  activeSpaces?: React.ReactNode;
}) {
  const positions = record?.positions ?? null;
  const debatesArgued = record?.debatesArgued ?? null;
  const joinedAt = record?.joinedAt ?? null;
  const hasStats = positions !== null || debatesArgued !== null;

  if (!hasStats && !disagreement && !activeSpaces && !joinedAt) return null;

  return (
    <>
      {hasStats || disagreement ? (
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-0.5 p-0">
          {debatesArgued !== null && (
            <Stat
              icon={<Megaphone size={ICON_SIZE} />}
              value={String(debatesArgued)}
              label={`${debatesArgued} ${debatesArgued === 1 ? 'debate' : 'debates'}`}
            />
          )}
          {positions !== null && (
            <Stat
              icon={<Warning size={ICON_SIZE} />}
              value={String(positions)}
              label={`${positions} ${positions === 1 ? 'position' : 'positions'}`}
            />
          )}
          {disagreement ? (
            <>
              {hasStats ? (
                <li className="text-browseSection text-grey-03" aria-hidden>
                  ·
                </li>
              ) : null}
              <li className="inline-flex items-center text-browseSection">{disagreement}</li>
            </>
          ) : null}
        </ul>
      ) : null}
      {activeSpaces}
      {joinedAt && (
        <Text as="p" variant="footnote" color="grey-04">
          On Geo since {formatJoinedAt(joinedAt)}
        </Text>
      )}
    </>
  );
}

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

import { markLobbyEntry } from '~/core/debates/lobbies/lobby-analytics';
import { hostsLabel } from '~/core/debates/lobbies/lobby-format';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';

import { Date as DateIcon } from '~/design-system/icons/date';
import { Text } from '~/design-system/text';

import { hubAnalyticsAttributes } from './hub-analytics';
import { hubCardMotion } from './hub-motion';
import { hubPillClassName } from './hub-pill-button';
import type { UpcomingLobbyRow } from './upcoming-lobby-rows';

/**
 * A lobby among the upcoming debates (GEO-3292). The same header as a scheduled debate's card, so
 * the list reads as one week, with the lobby's name and host where a debate has its "You vs Them"
 * strip, so it is never taken for a 1:1.
 */
export function UpcomingLobbyCard({
  row,
  formatTime,
  formatWhen,
}: {
  row: UpcomingLobbyRow;
  formatTime: (iso: string) => string;
  formatWhen: (iso: string) => string;
}) {
  const path = debateRoomPath(row.lobbyId);
  const hosts = hostsLabel(row.hosts);
  const byline = row.hosting ? 'You’re hosting' : hosts ? `Hosted by ${hosts}` : null;
  const action = row.open ? (row.onRoster ? 'Open lobby' : 'Join lobby') : 'View lobby';

  // Marked like the side panel card's links, so the join this leads to is attributed here.
  const enter = () => markLobbyEntry(row.lobbyId, 'requests');

  return (
    <motion.article
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
      data-testid="upcoming-lobby-card"
    >
      <div className="flex items-start gap-2">
        <DateIcon className="mt-0.5 shrink-0 text-text" />
        <div className="flex min-w-0 flex-col">
          <Text as="span" variant="metadataMedium">
            {row.due ? 'Starting now' : formatWhen(row.startsAt)}
          </Text>
          <Text as="span" variant="footnote" color="grey-04">
            {row.open ? 'The lobby is open' : `Opens at ${formatTime(row.opensAt)}`}
          </Text>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-grey-01 px-3 py-2.5">
        <Text as="span" variant="footnoteMedium" color="grey-04">
          Debate lobby
        </Text>
        <Text as="p" variant="metadataMedium" className="truncate">
          {row.name}
        </Text>
        {byline && (
          <Text as="p" variant="footnote" color="grey-04" className="truncate">
            {byline}
          </Text>
        )}
      </div>

      <Link
        href={path}
        onClick={enter}
        className={hubPillClassName(row.open && !row.onRoster ? 'primary' : 'secondary', 'w-full')}
        {...hubAnalyticsAttributes(`${action} from requests`, row.open ? 'join_lobby' : 'view_lobby')}
      >
        {action}
      </Link>
    </motion.article>
  );
}

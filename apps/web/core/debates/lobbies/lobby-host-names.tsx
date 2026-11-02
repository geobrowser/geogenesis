'use client';

import * as React from 'react';

import Link from 'next/link';

import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import type { DebateLobbyPerson, DebateLobbySummary } from '../api';
import { goingLabel, personName } from './lobby-format';

/**
 * The hosts as `hostsLabel` words them ("Bryan", "Bryan and Priya", "Bryan, Priya and 2 more"), each
 * name a link to the host's space. Takes its color from the line it sits in.
 */
export function LobbyHostNames({
  hosts,
  analyticsLabel,
}: {
  hosts: Pick<DebateLobbyPerson, 'user_id' | 'display_name' | 'profile_space_id'>[];
  /** Names the click for analytics, e.g. "Upcoming lobbies host". */
  analyticsLabel: string;
}) {
  const shown = hosts.length > 2 ? hosts.slice(0, 2) : hosts;
  const more = hosts.length - shown.length;

  return (
    <>
      {shown.map((host, index) => (
        <React.Fragment key={host.user_id}>
          {index > 0 ? (more > 0 ? ', ' : ' and ') : null}
          <HostName host={host} analyticsLabel={analyticsLabel} />
        </React.Fragment>
      ))}
      {more > 0 ? ` and ${more} more` : null}
    </>
  );
}

/**
 * A lobby's byline: "Bryan · 6 going", or "Hosted by Bryan · 6 going" with `hostedBy`, each host a
 * link. The count only while the lobby is still to open, and once anyone has RSVP'd: a live lobby
 * says who is there instead. `null` with nothing to say.
 */
export function LobbyByline({
  lobby,
  analyticsLabel,
  hostedBy = false,
}: {
  lobby: Pick<DebateLobbySummary, 'hosts' | 'reminder_count' | 'open'>;
  /** Names a click on a host. */
  analyticsLabel: string;
  hostedBy?: boolean;
}) {
  const going = !lobby.open && lobby.reminder_count > 0 ? goingLabel(lobby.reminder_count) : null;
  if (lobby.hosts.length === 0) return going;
  return (
    <>
      {hostedBy ? 'Hosted by ' : null}
      <LobbyHostNames hosts={lobby.hosts} analyticsLabel={analyticsLabel} />
      {going ? ` · ${going}` : null}
    </>
  );
}

function HostName({
  host,
  analyticsLabel,
}: {
  host: Pick<DebateLobbyPerson, 'display_name' | 'profile_space_id'>;
  analyticsLabel: string;
}) {
  const name = personName(host);
  if (!validateSpaceId(host.profile_space_id)) return <>{name}</>;
  return (
    <Link
      href={NavUtils.toSpace(host.profile_space_id)}
      data-geo-analytics-label={analyticsLabel}
      data-geo-analytics-intent="open_profile"
      className="hover:underline"
    >
      {name}
    </Link>
  );
}

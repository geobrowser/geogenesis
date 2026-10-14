'use client';

import * as React from 'react';

import Link from 'next/link';

import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import type { DebateLobbyPerson } from '../api';
import { personName } from './lobby-format';

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

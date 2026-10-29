'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateLobbyClaimList, DebateLobbyPerson } from '../api';
import { HUB_EYEBROW_CLASS_NAME } from '../matchmaking/hub-eyebrow';
import { useClaimListName } from './lobby-claim-list-tab';
import { goingLabel, hostsLabel, personName } from './lobby-format';
import { LobbyAvatarStack } from './lobby-people';

/**
 * What a lobby that has not opened says about itself: who hosts it, who is going, and the claim lists
 * it starts with. Shared by the lobby page's waiting card and the side panel's lobby details
 * (GEO-3463), so the two cannot describe the same lobby differently.
 */

/** "Ana, Ben and 12 more going", from the people geo-chat names and the true total beside them. */
export function goingNamesLabel(going: Pick<DebateLobbyPerson, 'display_name'>[] | undefined, count: number) {
  if (count <= 0) return null;
  const names = (going ?? []).map(personName);
  // A geo-chat that predates the list names nobody; the count still says how many.
  if (names.length === 0) return goingLabel(count);
  const shown = names.slice(0, 2);
  const more = count - shown.length;
  if (more <= 0) return `${shown.join(' and ')} going`;
  return `${shown.join(', ')} and ${more} more going`;
}

export function LobbyHostedBy({ hosts }: { hosts: DebateLobbyPerson[] }) {
  const hostedBy = hostsLabel(hosts);
  if (!hostedBy) return null;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="size-6 shrink-0 overflow-hidden rounded-full [&>svg]:size-full">
        <Avatar avatarUrl={hosts[0]!.avatar_cid} value={hosts[0]!.profile_space_id} alt="" size={24} />
      </span>
      <Text as="span" variant="metadata" color="grey-04" className="min-w-0 truncate">
        Hosted by {hostedBy}
      </Text>
    </div>
  );
}

export function LobbyGoing({ going, count }: { going?: DebateLobbyPerson[]; count: number }) {
  const label = goingNamesLabel(going, count);
  if (!label) return null;
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-testid="lobby-going">
      {going && going.length > 0 ? <LobbyAvatarStack people={going.slice(0, 5)} total={count} /> : null}
      <Text as="span" variant="metadata" color="grey-04" className="min-w-0">
        {label}
      </Text>
    </div>
  );
}

/** The claim lists a host attached (GEO-3273), by their pages' names. Nothing when there are none. */
export function LobbyClaimListNames({ lists }: { lists: DebateLobbyClaimList[] | undefined }) {
  if (!lists || lists.length === 0) return null;
  return (
    <section className="flex flex-col gap-1" aria-label="Claim lists">
      <h3 className={HUB_EYEBROW_CLASS_NAME}>Claim lists</h3>
      <ul className="flex flex-col gap-0.5">
        {lists.map(list => (
          <ClaimListName key={`${list.space_id}:${list.entity_id}`} list={list} />
        ))}
      </ul>
    </section>
  );
}

function ClaimListName({ list }: { list: DebateLobbyClaimList }) {
  const name = useClaimListName(list);
  return (
    <li>
      <Text as="span" variant="metadata" className="block truncate">
        {name}
      </Text>
    </li>
  );
}

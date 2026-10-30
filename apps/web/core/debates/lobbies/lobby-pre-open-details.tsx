'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Text } from '~/design-system/text';

import type { DebateLobbyClaimList, DebateLobbyPerson } from '../api';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HUB_EYEBROW_CLASS_NAME } from '../matchmaking/hub-eyebrow';
import { useDebateLobbyGoing } from './hooks';
import { useClaimListName } from './lobby-claim-list-tab';
import { goingLabel, hostsLabel, personName } from './lobby-format';
import { LobbyAvatarStack, LobbyPersonName } from './lobby-people';
import { LobbyPopup } from './lobby-popup';

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

/**
 * Who is going. For a host (`hostOf` the lobby's id), the row opens everyone going (GEO-3540); the
 * summary names at most two.
 */
export function LobbyGoing({ going, count, hostOf }: { going?: DebateLobbyPerson[]; count: number; hostOf?: string }) {
  const label = goingNamesLabel(going, count);
  if (!label) return null;
  const summary = (
    <>
      {going && going.length > 0 ? <LobbyAvatarStack people={going.slice(0, 5)} total={count} /> : null}
      <Text as="span" variant="metadata" color="grey-04" className="min-w-0">
        {label}
      </Text>
    </>
  );
  if (!hostOf) {
    return (
      <div className="flex min-w-0 items-center gap-2.5" data-testid="lobby-going">
        {summary}
      </div>
    );
  }
  return <EveryoneGoing lobbyId={hostOf} count={count} summary={summary} />;
}

export const EVERYONE_GOING_COPY = {
  title: (count: number) => `${count} going`,
  loading: 'Loading…',
  failed: 'Could not load who’s going.',
};

function EveryoneGoing({ lobbyId, count, summary }: { lobbyId: string; count: number; summary: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      title={EVERYONE_GOING_COPY.title(count)}
      align="start"
      wide
      trigger={
        <button
          type="button"
          data-testid="lobby-going"
          {...debateActionAnalyticsAttributes('hub', 'Lobby everyone going', 'open_lobby_going')}
          className="-mx-2 -my-1.5 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-grey-04 hover:bg-grey-01"
        >
          {summary}
          <span className="ml-auto shrink-0">
            <ChevronRight />
          </span>
        </button>
      }
    >
      <EveryoneGoingList lobbyId={lobbyId} count={count} />
    </LobbyPopup>
  );
}

/** Mounted on each open, so the list is read afresh. */
function EveryoneGoingList({ lobbyId, count }: { lobbyId: string; count: number }) {
  const { data, isError } = useDebateLobbyGoing(lobbyId, true);
  return (
    <section className="flex flex-col gap-1 p-2" aria-label={EVERYONE_GOING_COPY.title(data?.count ?? count)}>
      <Text as="p" variant="metadataMedium" className="px-2 pt-1 pb-1">
        {EVERYONE_GOING_COPY.title(data?.count ?? count)}
      </Text>
      {data ? (
        <ul className="flex max-h-[300px] flex-col overflow-y-auto">
          {data.people.map(person => (
            <li
              key={person.user_id}
              className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-grey-01"
            >
              <span className="size-6 shrink-0 overflow-hidden rounded-full [&>svg]:size-full">
                <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} alt="" size={24} />
              </span>
              <Text as="span" variant="metadata" className="min-w-0">
                <LobbyPersonName person={person} interactionSurface="lobby_going">
                  {personName(person)}
                </LobbyPersonName>
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text as="p" variant="metadata" color={isError ? 'red-01' : 'grey-04'} className="px-2 pb-1">
          {isError ? EVERYONE_GOING_COPY.failed : EVERYONE_GOING_COPY.loading}
        </Text>
      )}
    </section>
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

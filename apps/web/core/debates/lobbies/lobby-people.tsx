'use client';

import type * as React from 'react';

import { useOpenDebaterProfile } from '~/core/debates/browse/use-open-debater-profile';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import type { DebateLobbyPerson } from '../api';
import { personName } from './lobby-format';
import { useLobbyHandoff } from './lobby-popup';

/** An overlapping avatar stack with a `+N` tail for people present but not in `people`. */
export function LobbyAvatarStack({ people, total }: { people: DebateLobbyPerson[]; total: number }) {
  if (people.length === 0) return null;
  return (
    <AvatarGroup>
      {people.map(person => (
        <AvatarGroup.Item key={person.user_id} size={20}>
          <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} alt={personName(person)} size={20} />
        </AvatarGroup.Item>
      ))}
      <AvatarGroup.Overflow count={total - people.length} size={20} />
    </AvatarGroup>
  );
}

/**
 * A person's name that opens their profile in the entity side panel. Not a link: navigating away
 * unmounts the lobby page, which leaves the lobby and its voice.
 */
export function LobbyPersonName({
  person,
  interactionSurface,
  lazy,
  children,
}: {
  person: Pick<DebateLobbyPerson, 'profile_space_id'>;
  interactionSurface: string;
  /** Read the profile on the click even in a menu: a menu listing many people (everyone going). */
  lazy?: boolean;
  children: React.ReactNode;
}) {
  // In a lobby menu the profile is read up front, and the menu closes once the profile opens: closing
  // on the click would unmount this name and drop an open still waiting on the lookup.
  const { inPopup, close } = useLobbyHandoff();
  const openProfile = useOpenDebaterProfile(person.profile_space_id, {
    interactionSurface,
    lazy: lazy ?? !inPopup,
    onOpened: inPopup ? close : undefined,
  });

  return (
    <button type="button" onClick={openProfile} className="block max-w-full truncate text-left hover:underline">
      {children}
    </button>
  );
}

'use client';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import type { DebateLobbyPerson } from '../api';
import { personName } from './lobby-format';

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

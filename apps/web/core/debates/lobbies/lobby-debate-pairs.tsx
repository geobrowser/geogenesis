'use client';

import cx from 'classnames';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { type DebateLobbyMember, type DebateLobbyPair, dashlessId } from '../api';
import { LobbyDebateSubject } from './lobby-debate-subject';
import { pairLabel, pairSubject, personName } from './lobby-format';

/** A card per debate a lobby member is in (GEO-3131). Nothing when nobody is debating. */
export function LobbyDebatePairs({ pairs, members }: { pairs: DebateLobbyPair[]; members: DebateLobbyMember[] }) {
  if (pairs.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="In a debate">
      <Text as="h2" variant="footnoteMedium" color="grey-04">
        In a debate · {pairs.length}
      </Text>
      <ul className="flex flex-col gap-2">
        {pairs.map(pair => (
          <li
            key={pair.people.map(person => dashlessId(person.user_id)).join(':')}
            className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-3 py-2"
            data-testid="lobby-debate-pair"
          >
            <span className="flex shrink-0">
              {pair.people.map((person, index) => (
                <span
                  key={person.user_id}
                  className={cx('h-8 w-8 overflow-hidden rounded-full', index > 0 && '-ml-2 ring-2 ring-white')}
                >
                  <Avatar
                    avatarUrl={person.avatar_cid}
                    value={person.profile_space_id}
                    alt={personName(person)}
                    size={32}
                  />
                </span>
              ))}
            </span>
            <div className="min-w-0 flex-1">
              <Text as="p" variant="metadataMedium" ellipsize>
                {pairLabel(pair)}
              </Text>
              <Text as="p" variant="footnote" color="grey-04" ellipsize>
                <LobbyDebateSubject subject={pairSubject(pair, members)} />
              </Text>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

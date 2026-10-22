'use client';

import cx from 'classnames';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import {
  type DebateLobbyDebateSubject,
  type DebateLobbyMember,
  type DebateLobbyPair,
  type DebateLobbyPairPerson,
  dashlessId,
} from '../api';
import { sameId } from '../rooms/room-presence';
import { LobbyDebateSubject } from './lobby-debate-subject';
import { pairRoundLabel, pairSubject, personName } from './lobby-format';
import { LobbyPersonMenu, personMenuAnalyticsAttributes } from './lobby-person-menu';
import type { LobbyPageView } from './lobby-view';

/** A card per debate a lobby member is in (GEO-3131). Nothing when nobody is debating. */
export function LobbyDebatePairs({
  pairs,
  members,
  lobby,
  viewerId = null,
}: {
  pairs: DebateLobbyPair[];
  members: DebateLobbyMember[];
  lobby?: LobbyPageView;
  viewerId?: string | null;
}) {
  if (pairs.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5 md:gap-2" aria-label="In a debate">
      <h2 className="text-[17px] leading-[22px] font-semibold text-text">In a debate · {pairs.length}</h2>
      <ul className="flex flex-col gap-2">
        {pairs.map(pair => (
          <li
            key={pair.people.map(person => dashlessId(person.user_id)).join(':')}
            className="flex items-center gap-3 rounded-xl border border-grey-02 bg-white p-3 md:gap-2.5 md:p-2.5"
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
                {pair.people.map((person, index) => (
                  <span key={person.user_id}>
                    {index > 0 ? ' vs. ' : ''}
                    {lobby ? (
                      <PairPerson person={person} members={members} lobby={lobby} viewerId={viewerId} />
                    ) : (
                      personName(person)
                    )}
                  </span>
                ))}
              </Text>
              <Text as="p" variant="footnote" color="grey-04" ellipsize>
                <PairLine subject={pairSubject(pair, members)} round={pairRoundLabel(pair.progress)} />
              </Text>
            </div>
            {pair.progress?.recording ? <RecordingPill /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecordingPill() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-red-01 px-2.5 text-[14px] leading-none text-[#D9341C]">
      <span aria-hidden className="size-1 rounded-full bg-red-01" />
      Recording
    </span>
  );
}

/** "Cats are better · round 2 of 3"; either part may be missing. */
function PairLine({ subject, round }: { subject: DebateLobbyDebateSubject | null; round: string | null }) {
  const named =
    subject?.phase === 'choosing_claim' || (subject?.phase === 'on_claim' && subject.claim_name.trim() !== '');
  return (
    <>
      {named ? <LobbyDebateSubject subject={subject} bare /> : null}
      {named && round ? ' · ' : null}
      {round}
    </>
  );
}

/** Partners outside the roster can be scheduled too, but never get lobby moderation controls. */
function PairPerson({
  person,
  members,
  lobby,
  viewerId,
}: {
  person: DebateLobbyPairPerson;
  members: DebateLobbyMember[];
  lobby: LobbyPageView;
  viewerId: string | null;
}) {
  const rosterMember = members.find(member => sameId(member.user_id, person.user_id));
  const member: DebateLobbyMember = {
    role: 'listener',
    creator: false,
    acting_host: false,
    on_roster_since: '',
    stepped_out: true,
    ...rosterMember,
    ...person,
    in_debate: true,
  };
  const isSelf = viewerId !== null && sameId(viewerId, person.user_id);
  return (
    <LobbyPersonMenu
      lobby={lobby}
      member={member}
      isSelf={isSelf}
      viewerId={viewerId}
      disagreements={null}
      outsideLobby={!rosterMember}
    >
      <button
        type="button"
        {...personMenuAnalyticsAttributes(lobby, member, isSelf)}
        className="min-h-7 rounded px-0.5 text-left hover:underline md:min-h-11"
      >
        {personName(person)}
      </button>
    </LobbyPersonMenu>
  );
}

'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { activeDebate } from '../activity-state';
import type { DebatePerson } from '../api';
import { useCreateDebateChallenge, useDebateActivity } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useDebatePeople, useDebateRequests } from './hooks';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';

/**
 * Everyone online and available right now. The Debate button sends the same claimless challenge as
 * `ProfileDebateButton` on a person's home space — `DebateCoordinator` owns the resulting dialog.
 */
export function PeopleTab() {
  const peopleQuery = useDebatePeople(true);
  const { data: activity } = useDebateActivity(true);
  const { data: requests } = useDebateRequests(true);
  const people = peopleQuery.data?.people ?? [];

  // Every Debate button greys out at once when the viewer already has something open, so say why
  // rather than leaving a list of dead buttons.
  const blockedReason =
    activity?.challenge?.status === 'pending'
      ? 'You have a debate request awaiting a reply.'
      : activeDebate(activity)
        ? "You're already in a debate."
        : activity?.outbound_request || requests?.outbound
          ? 'You already have an open request — withdraw it to challenge someone else.'
          : null;

  return (
    // Matches the other tabs' inset so content doesn't shift when switching between them.
    <div className="px-4 py-3">
      <HubQueryState
        isLoading={peopleQuery.isLoading}
        error={peopleQuery.error}
        isEmpty={people.length === 0}
        emptyMessage="Nobody is available to debate right now."
      >
        <>
          {blockedReason ? (
            <Text as="p" variant="footnote" color="grey-04" className="pb-2">
              {blockedReason}
            </Text>
          ) : null}
          <ul className="flex flex-col">
            {people.map(person => (
              <PersonRow key={person.user_id} person={person} blockedReason={blockedReason} />
            ))}
          </ul>
        </>
      </HubQueryState>
    </div>
  );
}

function PersonRow({ person, blockedReason }: { person: DebatePerson; blockedReason: string | null }) {
  const createChallenge = useCreateDebateChallenge();

  return (
    <li className="flex items-center justify-between gap-3 border-b border-grey-02 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={32} />
        </div>
        <Text as="p" variant="metadataMedium" className="truncate">
          {speakerLabel(person)}
        </Text>
      </div>
      <HubPillButton
        onClick={() => createChallenge.mutate({ recipient_profile_space_id: person.profile_space_id })}
        disabled={!person.can_challenge || person.in_debate || Boolean(blockedReason)}
        pending={createChallenge.isPending}
        pendingLabel="Requesting…"
        title={blockedReason ?? undefined}
      >
        {person.in_debate ? 'In a debate' : 'Debate'}
      </HubPillButton>
    </li>
  );
}

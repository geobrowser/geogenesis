'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';

import type { DebatePerson } from '../api';
import { useCreateDebateChallenge, useDebateActivity } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useDebatePeople, useDebateRequests } from './hooks';
import { HubQueryState } from './hub-states';

/**
 * Everyone online and available right now. The Debate button sends the same claimless challenge as
 * `ProfileDebateButton` on a person's home space — `DebateCoordinator` owns the resulting dialog.
 */
export function PeopleTab() {
  const peopleQuery = useDebatePeople(true);
  const people = peopleQuery.data?.people ?? [];

  return (
    <HubQueryState
      isLoading={peopleQuery.isLoading}
      error={peopleQuery.error}
      isEmpty={people.length === 0}
      emptyMessage="Nobody is available to debate right now."
    >
      <ul className="flex flex-col">
        {people.map(person => (
          <PersonRow key={person.user_id} person={person} />
        ))}
      </ul>
    </HubQueryState>
  );
}

function PersonRow({ person }: { person: DebatePerson }) {
  const createChallenge = useCreateDebateChallenge();
  const { data: activity } = useDebateActivity(true);
  const { data: requests } = useDebateRequests(true);

  // One outbound request at a time, and a pending challenge or live debate blocks new ones too.
  const busy = Boolean(
    activity?.challenge?.status === 'pending' ||
    activity?.match ||
    activity?.debate ||
    activity?.outbound_request ||
    requests?.outbound
  );

  return (
    <li className="flex items-center justify-between gap-3 border-b border-grey-02 px-4 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={32} />
        </div>
        <p className="truncate text-metadataMedium">{speakerLabel(person)}</p>
      </div>
      <button
        type="button"
        onClick={() => createChallenge.mutate({ recipient_profile_space_id: person.profile_space_id })}
        disabled={!person.can_challenge || person.in_debate || busy || createChallenge.isPending}
        className="inline-flex h-7 shrink-0 items-center rounded-full border border-grey-02 px-3 text-metadata transition-colors hover:bg-grey-01 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {person.in_debate ? 'In a debate' : createChallenge.isPending ? 'Requesting...' : 'Debate'}
      </button>
    </li>
  );
}

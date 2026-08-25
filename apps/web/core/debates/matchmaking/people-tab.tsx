'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { activeDebate } from '../activity-state';
import type { DebatePerson } from '../api';
import { useCreateDebateChallenge, useDebateActivity } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { DebateChallengeCard } from './challenge-card';
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
  const currentUserId = useCurrentGeoChatUserId();
  const people = peopleQuery.data?.people ?? [];

  const pendingChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  // `activity.challenge` is whichever challenge involves the viewer, in either direction. The card
  // is about a request you sent, so it only stands in for the message when you are the one waiting
  // on a reply — being challenged blocks the buttons just the same, but the sentence is what
  // explains that.
  const outboundChallenge =
    pendingChallenge && currentUserId && pendingChallenge.requester.user_id === currentUserId ? pendingChallenge : null;

  // Every Debate button greys out at once when the viewer already has something open, so say why
  // rather than leaving a list of dead buttons. The card says it for an outbound challenge, so the
  // sentence would only repeat it.
  const blockedReason = pendingChallenge
    ? outboundChallenge
      ? null
      : 'You have a debate request awaiting a reply.'
    : activeDebate(activity)
      ? "You're already in a debate."
      : activity?.outbound_request || requests?.outbound
        ? 'You already have an open request — withdraw it to challenge someone else.'
        : null;

  // Kept separate from `blockedReason`: the card replaces the sentence but not the reason every
  // button below is disabled.
  const buttonsDisabled = Boolean(blockedReason) || Boolean(outboundChallenge);

  return (
    <div className="flex flex-col">
      {/* Sticky above the list, the way Matches keeps a sent claim request in view — a request you
          are waiting on shouldn't scroll away behind the people you can no longer ask. */}
      {outboundChallenge ? (
        <div className="sticky top-0 z-10 border-b border-grey-02 bg-white px-4 py-3">
          <DebateChallengeCard challenge={outboundChallenge} role="requester" />
        </div>
      ) : null}

      {/* Matches the other tabs' inset so content doesn't shift when switching between them. */}
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
                <PersonRow
                  key={person.user_id}
                  person={person}
                  disabled={buttonsDisabled}
                  disabledReason={blockedReason ?? 'You have a debate request awaiting a reply.'}
                />
              ))}
            </ul>
          </>
        </HubQueryState>
      </div>
    </div>
  );
}

function PersonRow({
  person,
  disabled,
  disabledReason,
}: {
  person: DebatePerson;
  disabled: boolean;
  /** Only surfaced on hover, so it explains the greyed-out button without repeating the card. */
  disabledReason: string;
}) {
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
        disabled={!person.can_challenge || person.in_debate || disabled}
        pending={createChallenge.isPending}
        pendingLabel="Requesting…"
        title={disabled ? disabledReason : undefined}
      >
        {person.in_debate ? 'In a debate' : 'Debate'}
      </HubPillButton>
    </li>
  );
}

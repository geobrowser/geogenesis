'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { Avatar } from '~/design-system/avatar';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

import { activeDebate } from '../activity-state';
import type { DebatePerson } from '../api';
import { useCreateDebateChallenge, useDebateActivity, useGeoChatAuth } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { DebateChallengeCard } from './challenge-card';
import { HubStickyControls } from './claims-tab';
import { useDebatePeople, useDebateRequests } from './hooks';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * Everyone online and available right now. The Debate button sends the same claimless challenge as
 * `ProfileDebateButton` on a person's home space — `DebateCoordinator` owns the resulting dialog.
 */
export function PeopleTab() {
  const { authenticated } = useGeoChatAuth();
  const promptSignIn = usePrivySignIn();
  // Undefined when signed in, so every path below keeps behaving exactly as it did.
  const onRequireSignIn = authenticated ? undefined : promptSignIn;

  const peopleQuery = useDebatePeople(true);
  // Both describe the viewer's own state, so signed out there is nothing to ask for. Passing
  // `authenticated` rather than `true` keeps them from firing a request that can only 401.
  const { data: activity } = useDebateActivity(authenticated);
  const { data: requests } = useDebateRequests(authenticated);
  const currentUserId = useCurrentGeoChatUserId();
  const allPeople = React.useMemo(() => peopleQuery.data?.people ?? [], [peopleQuery.data]);

  // Filtered here rather than through the query: this endpoint has no search parameter and returns
  // whoever is available right now in one unpaginated list, so there is nothing to page back for.
  // Matching the same label the row renders keeps "search for what you can see" true.
  const [search, setSearch] = React.useState('');
  const people = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allPeople;
    return allPeople.filter(person => speakerLabel(person).toLowerCase().includes(term));
  }, [allPeople, search]);

  const reportedChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  // A challenge stays `pending` in the activity payload until the server says otherwise, so its own
  // expiry has to be applied here — the same filter every other request surface derives from, so
  // none of them disagree about a dead request while waiting for `debate.requests_changed`. Without
  // it this tab would sit on an "Expired" card with every Debate button still dead underneath it.
  const liveChallenges = useUnexpiredRequests(
    React.useMemo(() => (reportedChallenge ? [reportedChallenge] : []), [reportedChallenge])
  );
  const pendingChallenge = liveChallenges[0] ?? null;
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
      {/* One pinned block, like Matches: a request you are waiting on shouldn't scroll away behind
          the people you can no longer ask, and search shouldn't either. Two stickies would both
          claim `top-0` and overlap, and the card is conditional so search couldn't be offset by a
          known height. */}
      <HubStickyControls>
        {outboundChallenge ? <DebateChallengeCard challenge={outboundChallenge} role="requester" /> : null}
        <Input
          withSearchIcon
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder="Search people"
          aria-label="Search people"
        />
      </HubStickyControls>

      {/* Matches the other tabs' inset so content doesn't shift when switching between them. */}
      <div className="px-4 py-3">
        <HubQueryState
          isLoading={peopleQuery.isLoading}
          error={peopleQuery.error}
          isEmpty={people.length === 0}
          emptyMessage={
            search.trim() ? 'Nobody available matches that search.' : 'Nobody is available to debate right now.'
          }
          emptyAction={search.trim() ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
          signInAction={
            onRequireSignIn
              ? { label: 'Sign in', message: 'Sign in to see who is available to debate.', onClick: onRequireSignIn }
              : undefined
          }
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
                  onRequireSignIn={onRequireSignIn}
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
  onRequireSignIn,
}: {
  person: DebatePerson;
  disabled: boolean;
  /** Only surfaced on hover, so it explains the greyed-out button without repeating the card. */
  disabledReason: string;
  /**
   * Set only when signed out. Pressing Debate then opens Privy instead of sending a request, which
   * would fail at the token exchange with an error the viewer can do nothing about.
   */
  onRequireSignIn?: () => void;
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
        onClick={() =>
          onRequireSignIn
            ? onRequireSignIn()
            : createChallenge.mutate({ recipient_profile_space_id: person.profile_space_id })
        }
        // Signed out, the row's own availability flags are about nobody in particular, so they are
        // not a reason to refuse the press — the press is what starts the sign-in.
        disabled={!onRequireSignIn && (!person.can_challenge || person.in_debate || disabled)}
        pending={createChallenge.isPending}
        pendingLabel="Requesting…"
        title={disabled ? disabledReason : undefined}
      >
        {person.in_debate ? 'In a debate' : 'Debate'}
      </HubPillButton>
    </li>
  );
}

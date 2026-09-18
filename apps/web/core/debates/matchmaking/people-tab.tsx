'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { type SpaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Input } from '~/design-system/input';
import { OnlineDot } from '~/design-system/online-dot';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { activeDebate } from '../activity-state';
import type { DebatePerson } from '../api';
import { useCreateDebateChallenge, useDebateActivity, useGeoChatAuth } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { DebateChallengeCard } from './challenge-card';
import { HubStickyControls, SpaceTopicFilters } from './claims-tab';
import { DebateHoursNote } from './debate-hours-note';
import { useDebatePeople, useDebateRequests } from './hooks';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import type { PersonRecord } from './person-record';
import { PersonRecordLine } from './person-record-line';
import { isPersonId } from './person-records-document';
import { PersonSpaceIcons } from './person-space-icons';
import { usePersonRecords } from './use-person-records';
import { useUnexpiredRequests } from './use-request-countdown';
import { useSpaceFilterMenu } from './use-space-filter-selection';
import { type DebatesHubTab, debatesHubPeopleSpaceIdsAtom } from '~/atoms';

/**
 * Whether the records batch has answered for everybody queryable on the current roster.
 *
 * `usePersonRecords` keeps the previous roster's map while a new one lands. Checking the current ids
 * rather than `records.size` keeps that placeholder from reconciling a selection against people who
 * have already left, or clearing it before a newly arrived person's activity has loaded.
 */
const EMPTY_SPACE_IDS: string[] = [];

function recordsPending(personIds: string[], records: Map<string, PersonRecord>): boolean {
  return personIds.some(personId => isPersonId(personId) && !records.has(personId));
}

/**
 * Everyone online and available right now. The Debate button sends the same claimless challenge as
 * `ProfileDebateButton` on a person's home space — `DebateCoordinator` owns the resulting dialog.
 */
export function PeopleTab({ onTabChange }: { onTabChange: (tab: DebatesHubTab) => void }) {
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
  // One elevated portal for every row's space list. A portal per person would append a matching
  // number of containers to the body, while a plain Radix portal sits behind this z-200 panel.
  const spacesPopoverPortal = useElevatedPopoverPortal();
  const allPeople = React.useMemo(() => peopleQuery.data?.people ?? [], [peopleQuery.data]);

  // Held outside this component so they survive it, exactly as the claim tabs' filters are: the hub
  // closes on any outside pointer-down, so dismissing a dropdown by clicking away unmounts this tab
  // and `useState` would take the viewer's selection with it (GEO-2850).
  const [spaceIds, setSpaceIds] = useAtom(debatesHubPeopleSpaceIdsAtom);

  // Keyed on everyone available rather than on the filtered list, so narrowing re-slices a batch
  // that is already cached instead of firing a request per keystroke.
  const personIds = React.useMemo(() => allPeople.map(person => person.profile_space_id), [allPeople]);
  const records = usePersonRecords(personIds);
  const personRecordsPending = recordsPending(personIds, records);

  const { publishableSpaceIds, isLoading: publishableSpacesLoading } = useDebatePublishableSpaces();
  const publishableSpacesPending = publishableSpaceIds === null && publishableSpacesLoading;
  const spaceActivityPending = publishableSpacesPending || personRecordsPending;

  // "Active in" means evidence of activity, not membership: at least one distinct claim answered
  // or one recorded debate in that space. The same map drives both the row and the filter so a
  // membership-only space cannot appear in one surface but not the other. The publishable-space
  // gate is still the claim picker's authoritative acceptor-editor set. A settled lookup with no
  // answer deliberately fails open, matching `isSpaceDebatePublishable` elsewhere; an in-flight
  // lookup is different, because drawing its unverified spaces would briefly make them selectable.
  // Person records get the same treatment: a partial batch must not filter out people whose row has
  // not landed yet.
  const debateSpacesByPerson = React.useMemo(() => {
    const byPerson = new Map<string, string[]>();
    if (spaceActivityPending) return byPerson;

    for (const [personId, record] of records) {
      const activeIds = new Set<string>();
      for (const spaceId of record.activeSpaceIds) {
        if (isSpaceDebatePublishable(spaceId, publishableSpaceIds)) {
          activeIds.add(normId(spaceId));
        }
      }
      byPerson.set(personId, [...activeIds]);
    }
    return byPerson;
  }, [publishableSpaceIds, records, spaceActivityPending]);

  const activeSpaceIds = React.useMemo(() => {
    return new Set(allPeople.flatMap(person => debateSpacesByPerson.get(person.profile_space_id) ?? []));
  }, [allPeople, debateSpacesByPerson]);

  // Keep the remembered atom untouched until both activity inputs settle, but never let a stale or
  // not-yet-verified value affect the current render. Filtering it synchronously also closes the
  // render between a gate settling and the reconciliation effect below committing its cleanup.
  const effectiveSpaceIds = React.useMemo(
    () => (spaceActivityPending ? EMPTY_SPACE_IDS : spaceIds.filter(spaceId => activeSpaceIds.has(normId(spaceId)))),
    [activeSpaceIds, spaceActivityPending, spaceIds]
  );

  // A remembered selection can outlive the panel, the activity set, or the publishable set.
  // Reconcile against the exact options this tab is allowed to offer so `keepSelectedVisible`
  // cannot put a disabled, membership-only, or zero-activity space back into the dropdown.
  React.useEffect(() => {
    if (spaceActivityPending) return;
    setSpaceIds(current => {
      const kept = current.filter(spaceId => activeSpaceIds.has(normId(spaceId)));
      return kept.length === current.length ? current : kept;
    });
  }, [activeSpaceIds, setSpaceIds, spaceActivityPending]);

  // Filtered here rather than through the query: this endpoint takes no parameters at all and
  // returns whoever is available right now in one unpaginated list, so there is nothing to page
  // back for and every filter below is a slice of what is already in hand.
  const [search, setSearch] = React.useState('');

  // Matching the same label the row renders keeps "search for what you can see" true.
  const searchedPeople = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allPeople;
    return allPeople.filter(person => speakerLabel(person).toLowerCase().includes(term));
  }, [allPeople, search]);

  const people = React.useMemo(() => {
    if (effectiveSpaceIds.length === 0) return searchedPeople;
    const wanted = new Set(effectiveSpaceIds.map(normId));
    return searchedPeople.filter(person =>
      (debateSpacesByPerson.get(person.profile_space_id) ?? []).some(spaceId => wanted.has(spaceId))
    );
  }, [debateSpacesByPerson, effectiveSpaceIds, searchedPeople]);

  // Counted over everything the *other* filters leave, which is what a facet count means here as it
  // does on the claim tabs: the number beside a space is what picking it would give you, so it
  // cannot be counted against a space selection that picking it would replace.
  const offeredSpaces = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of searchedPeople) {
      for (const spaceId of debateSpacesByPerson.get(person.profile_space_id) ?? []) {
        counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
      }
    }
    return [...counts].map(([id, count]) => ({ id, name: null, count }));
  }, [debateSpacesByPerson, searchedPeople]);

  // The same menu the claim tabs draw, but People deliberately defaults to "Any space". Passing a
  // spent membership seed prevents the shared menu wiring from auto-selecting the viewer's spaces;
  // an empty selection therefore leaves the full Geo Chat roster visible, including people with no
  // qualifying activity. Explicit selections still persist with the atom above.
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds: effectiveSpaceIds,
    setSpaceIds,
    memberSpaceIds: null,
    pending: peopleQuery.isLoading || spaceActivityPending,
    seedSpent: true,
  });

  // Names and thumbnails for the menu and the row icons in one lookup, so the same space is drawn
  // the same way in both. The viewer's selection is included: a space can be picked and then
  // counted out of the facets, and it still has to be nameable in the trigger.
  const { labelsById } = useSpaceLabels(
    React.useMemo(
      () => [...new Set([...facetSpaces.map(space => space.id), ...effectiveSpaceIds])],
      [effectiveSpaceIds, facetSpaces]
    )
  );

  // Whether the viewer's own filters are what emptied the list, as opposed to nobody being online.
  // The two empty states, the debate-hours line and the undo action all hang off it, so they cannot
  // disagree about which of the two this is.
  const filtersExcludedEveryone = people.length === 0 && allPeople.length > 0;
  // Which undo to offer. Search alone keeps the wording it had, because a viewer who typed
  // something knows what to take back; once a space filter is involved "Clear search" would name
  // one of the two things holding the list down.
  const searchIsTheOnlyFilter = Boolean(search.trim()) && effectiveSpaceIds.length === 0;

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
        {/* The claim tabs' own filter bar, not a second one built to look like it (GEO-2944).
            Topic props are omitted because people carry no topics to facet on, the same way the
            requests bar omits them. */}
        <SpaceTopicFilters
          spaceIds={effectiveSpaceIds}
          onSpaceToggle={onSpaceToggle}
          onSpacesClear={onSpacesClear}
          facetSpaces={facetSpaces}
          countsPending={spaceActivityPending}
        />
      </HubStickyControls>

      {/* Matches the other tabs' inset so content doesn't shift when switching between them. */}
      <div className="px-4 py-3">
        <HubQueryState
          isLoading={peopleQuery.isLoading}
          error={peopleQuery.error}
          failureReason={peopleQuery.failureReason}
          // The other three lists have always had this, and the setup state needs it more than the
          // error state did: these reads do not refetch on focus or reconnect, so once the warm-up
          // retries run out this message is as far as the tab gets on its own.
          onRetry={() => void peopleQuery.refetch()}
          isEmpty={people.length === 0}
          // Which of the two empty states this is turns on whether anyone is online *at all*, not
          // on whether the search box has something in it. With nobody available, a search is not
          // what emptied the list — saying it was would blame a filter for the room being empty,
          // and "Clear search" would be an action that changes nothing.
          emptyMessage={
            filtersExcludedEveryone
              ? searchIsTheOnlyFilter
                ? 'Nobody available matches that search.'
                : 'Nobody available matches those filters.'
              : 'Nobody is available to debate right now.'
          }
          // GEO-2840 scopes this to the nobody-online case, which is exactly the other side of that
          // same question: a list the viewer emptied with their own search is a different problem,
          // and debate hours does not answer it.
          // The one tab that can show this to a signed-out viewer — People is readable anonymously
          // (GEO-2725), but `useMatchmakingScope` gates the gateway on a session, so their list is
          // static and no amount of waiting will fill it. They cannot be matched either. `live` is
          // what keeps the copy from promising both.
          emptyNote={filtersExcludedEveryone ? undefined : <DebateHoursNote live={authenticated} />}
          // Exactly one action, and which one follows the same question the message and the note do.
          // A search the viewer can undo gets the undo; a room that is genuinely empty gets somewhere
          // to go, because there is nothing to undo and waiting is the only other option (GEO-2840).
          emptyAction={
            filtersExcludedEveryone
              ? searchIsTheOnlyFilter
                ? { label: 'Clear search', onClick: () => setSearch('') }
                : {
                    label: 'Clear filters',
                    onClick: () => {
                      setSearch('');
                      onSpacesClear();
                    },
                  }
              : { label: 'Explore claims', onClick: () => onTabChange('explore') }
          }
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
                  record={records.get(person.profile_space_id) ?? null}
                  spaceIds={debateSpacesByPerson.get(person.profile_space_id) ?? EMPTY_SPACE_IDS}
                  labelsById={labelsById}
                  popoverPortal={spacesPopoverPortal}
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
  record,
  spaceIds,
  labelsById,
  popoverPortal,
  disabled,
  disabledReason,
  onRequireSignIn,
}: {
  person: DebatePerson;
  /** Fetched once for the whole list, so a row never asks for its own. Null until that lands. */
  record: PersonRecord | null;
  /** Debate-enabled spaces where this person has at least one claim position or recorded debate. */
  spaceIds: string[];
  /** Resolved once for the tab, so the menu and these icons draw the same space the same way. */
  labelsById: Map<string, SpaceLabel>;
  /** Shared across the list so every row's popup clears the debates panel without one portal each. */
  popoverPortal: HTMLElement | null;
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
  const profileHref = validateSpaceId(person.profile_space_id) ? NavUtils.toSpace(person.profile_space_id) : null;
  const activeSpaces =
    spaceIds.length > 0 ? (
      <PersonSpaceIcons
        spaceIds={spaceIds}
        labelsById={labelsById}
        claimsBySpace={record?.claimsBySpace}
        debatesBySpace={record?.debatesBySpace}
        popoverPortal={popoverPortal}
      />
    ) : null;

  return (
    // Three columns rather than a flex run, so the button sits in its own track instead of sharing a
    // row box with the name — where it was the tallest thing and set the name's line height. All
    // three tracks centre on the row: hanging them from the top clustered everything up there and
    // left the join date trailing under an empty right-hand side.
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-grey-02 py-2.5 last:border-b-0">
      {/* Everyone in this list is online by definition — the tab is "everyone online and available
          right now" — so the dot needs no condition, and it ties the faces here to the ones inside
          the claim pills, which mean the same thing. The clip sits on the inner span: on the
          wrapper it would cut the half of the dot that hangs over the rim. */}
      <div className="relative h-8 w-8 shrink-0">
        <div className="h-8 w-8 overflow-hidden rounded-full">
          <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={32} />
        </div>
        {/* The face here is 32px, twice the claim pills', so the dot is twice theirs: 8px of green
            in a 4px ring. It carried the pills' 8px dot before, which on a face this size read as
            a speck rather than a badge. */}
        <OnlineDot faceSize={32} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* The name goes to their personal space, which is the profile page GEO-2611 settled on.
            A plain anchor, with no click handler at all: the hub survives the navigation on its
            own now (GEO-2788), so there is nothing to intercept — which is also what keeps
            cmd-click, middle click and "copy link address" working here (GEO-2701).

            Unlinked when the id is not a space id. Rendering an anchor to `/space/undefined`
            would look identical until it was clicked. */}
        {profileHref ? (
          <Link href={profileHref} className="min-w-0">
            <Text as="span" variant="metadataMedium" className="block truncate hover:underline">
              {speakerLabel(person)}
            </Text>
          </Link>
        ) : (
          <Text as="p" variant="metadataMedium" className="truncate">
            {speakerLabel(person)}
          </Text>
        )}
        {/* Deliberately three lines: stats, active spaces, then the join date. Keeping "Active in"
            immediately above "On Geo since" makes both read as profile context, while the popup
            gives the compact avatar stack somewhere to reveal its full answer. */}
        {record || spaceIds.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            {record ? <PersonRecordLine record={record} activeSpaces={activeSpaces} /> : activeSpaces}
          </div>
        ) : null}
      </div>
      <HubPillButton
        onClick={() =>
          onRequireSignIn
            ? onRequireSignIn()
            : createChallenge.mutate({ recipient_profile_space_id: person.profile_space_id })
        }
        // `in_debate` holds signed out too: it means this person is in an active debate right now,
        // which is true of them rather than of any viewer, so signing in would not make them
        // available. `can_challenge` and the viewer's own pending request are the viewer-relative
        // ones, and those are what the press bypasses on its way to the sign-in.
        disabled={person.in_debate || (!onRequireSignIn && (!person.can_challenge || disabled))}
        pending={createChallenge.isPending}
        pendingLabel="Requesting…"
        title={disabled ? disabledReason : undefined}
      >
        {person.in_debate ? 'In a debate' : 'Request debate'}
      </HubPillButton>
    </li>
  );
}

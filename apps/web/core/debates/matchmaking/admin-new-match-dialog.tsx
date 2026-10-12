'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';

import { useSearch } from '~/core/hooks/use-search';
import { normId } from '~/core/utils/norm-id';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

import { MUTUAL_SLOT, SELECTED_SLOT } from '~/partials/availability/peer-availability';
import { ScheduleDialog } from '~/partials/availability/schedule-dialog';

import { type DebatePerson, GeoChatRequestError, isDebateProfileMissing } from '../api';
import { speakerLabel } from '../playback-utils';
import { dayShift, timeIn, zoneCity } from './admin-debate-calendar-model';
import { DebaterFace, POSITIVE_TEXT_CLASS, debaterFirstName } from './admin-debate-parts';
import {
  ADMIN_MATCH_DAYS,
  useAdminAvailabilityPrompt,
  useAdminDebaters,
  useAdminPairOverlap,
  useCreateAdminMatch,
} from './admin-hooks';
import { useAdminPairFit, useAdminSharedFreeSlots } from './admin-pair-fit';
import { SegmentedControl, useMinuteClock } from './debate-calendar-controls';
import { HubPillButton } from './hub-pill-button';
import { offlinePerson } from './offline-person';
import { byPairFit, fitReasonText } from './pair-fit';
import type { PersonRecord } from './person-record';
import { PersonRecordLine } from './person-record-line';
import { SpaceFilterPills } from './space-filter-pills';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { usePersonFacts } from './use-person-facts';
import { useSpaceFilterMenu } from './use-space-filter-selection';

const SLOT_MINUTES = 30;
const EMPTY_SPACE_IDS: string[] = [];

/** What became of asking someone to set their availability. */
type PromptOutcome = 'pending' | 'sent' | 'no_email' | 'not_on_debates' | 'error';

/** The outcomes that settle it: asking again would email someone for nothing. */
const SETTLED_PROMPTS: ReadonlySet<PromptOutcome> = new Set(['pending', 'sent', 'no_email', 'not_on_debates']);

/** A time picked, and whether it is outside their availability: `null` until their overlap is known. */
type Choice = { start: number; outside: boolean | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Focus goes back here on close. */
  openerRef?: React.RefObject<HTMLElement | null>;
  /** Told what was sent, so the calendar can say so once the dialog has gone. */
  onSent: (note: string) => void;
};

/**
 * New match (GEO-2942): an admin pairs two debaters and invites both, as if one had asked the
 * other. One page rather than the ticket's four-step rail.
 *
 * - **Search covers everyone.** Everyone with availability is listed from the start; anyone else is
 *   found by name through Geo search. Only people with availability can be picked. Everyone else
 *   gets Request availability, which emails them, and says so when there is no email on file.
 * - **Once debater 1 is picked**, the list reorders by matches with them, the People tab's order
 *   measured from that person instead of the viewer. When gaia's pair fit is available (GEO-3224)
 *   it orders by fit instead, halved for anyone with no free time in common, and each row says
 *   why ("Disagrees with Ana on ..."); when it is not, the order is exactly the matches order.
 * - **Recommended** offers the half-hours both are free; **Pick any time** is the override, kept a
 *   separate mode so nobody drifts into it. Every time shows both debaters' own clocks.
 */
export function AdminNewMatchDialog({ open, onOpenChange, openerRef, onSent }: Props) {
  return (
    <ScheduleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New match"
      description="Both debaters get an invite, the same as when one person asks another."
      openerRef={openerRef}
      widthClassName="w-[68rem]"
    >
      {/* Mounted per opening, so a half-built match never survives into the next one. */}
      {open ? (
        <NewMatchBody
          onClose={() => onOpenChange(false)}
          onSent={note => {
            onSent(note);
            onOpenChange(false);
          }}
        />
      ) : null}
    </ScheduleDialog>
  );
}

type Picked = { userId: string; person: DebatePerson };

function NewMatchBody({ onClose, onSent }: { onClose: () => void; onSent: (note: string) => void }) {
  const [first, setFirst] = React.useState<Picked | null>(null);
  const [second, setSecond] = React.useState<Picked | null>(null);
  const [spaceIds, setSpaceIds] = React.useState<string[]>(EMPTY_SPACE_IDS);
  const [prompts, setPromptsState] = React.useState<ReadonlyMap<string, PromptOutcome>>(new Map());
  // Mirrored synchronously: two presses in one tick both read the same render's state, and the
  // second would email everyone the first just did.
  const promptsRef = React.useRef<ReadonlyMap<string, PromptOutcome>>(prompts);
  const setPrompt = (userId: string, outcome: PromptOutcome) => {
    promptsRef.current = new Map(promptsRef.current).set(normId(userId), outcome);
    setPromptsState(promptsRef.current);
  };

  const debatersQuery = useAdminDebaters(true);
  const availableIds = React.useMemo(
    () => [...new Set((debatersQuery.data ?? []).map(debater => normId(debater.user_id)))],
    [debatersQuery.data]
  );
  const isAvailable = React.useMemo(() => new Set(availableIds), [availableIds]);

  // Everyone with availability, read once and kept: the roster the facts below are keyed on, so a
  // keystroke never re-reads it or blanks the list while it loads.
  const roster = useGeoChatUserSummaries(availableIds, availableIds.length > 0);
  const rosterPeople = React.useMemo(() => roster.map(offlinePerson), [roster]);

  // Geo search for people by name: how anyone without availability is found at all. A geo-chat user
  // id is the page entity of their personal space, so a person hit is a candidate id as it stands;
  // the summaries lookup keeps only the hits that front a personal space.
  const search = useSearch({ filterByTypes: [SystemIds.PERSON_TYPE], restrictToFilterTypes: true });
  const searchTerm = search.query.trim().toLowerCase();
  const hitIds = React.useMemo(
    () => (searchTerm ? search.results.map(result => normId(result.id)).filter(id => !isAvailable.has(id)) : []),
    [isAvailable, search.results, searchTerm]
  );
  const hits = useGeoChatUserSummaries(hitIds, hitIds.length > 0);
  const hitPeople = React.useMemo(() => hits.map(offlinePerson), [hits]);

  const facts = usePersonFacts(rosterPeople, {
    authenticated: true,
    rosterUnavailable: debatersQuery.isPending,
    anchorProfileSpaceId: first ? first.person.profile_space_id : null,
  });
  // As the People tab does: a count is only shown, and only ranks, once it is known for this anchor.
  const ranking = first !== null && facts.matchesKnown;
  const rosterProfileIds = React.useMemo(() => rosterPeople.map(person => person.profile_space_id), [rosterPeople]);
  const fit = useAdminPairFit(first ? first.person.profile_space_id : null, rosterProfileIds);
  const freeSlots = useAdminSharedFreeSlots(first ? first.userId : null, availableIds);
  const fitRanking = first !== null && fit.available;
  const fitOf = (person: DebatePerson) => (first ? fit.byProfile.get(normId(person.profile_space_id)) : undefined);
  const matchCount = (person: DebatePerson) =>
    facts.matchAnalysis.byProfile.get(normId(person.profile_space_id))?.length ?? 0;

  const offeredSpaces = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of rosterPeople) {
      for (const spaceId of facts.debateSpacesByPerson.get(person.profile_space_id) ?? []) {
        counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
      }
    }
    for (const spaceId of spaceIds) if (!counts.has(normId(spaceId))) counts.set(normId(spaceId), 0);
    return [...counts].map(([id, count]) => ({ id, name: null, count }));
  }, [facts.debateSpacesByPerson, rosterPeople, spaceIds]);
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    setSpaceIds,
    memberSpaceIds: null,
    pending: facts.spaceActivityUnavailable,
    seedSpent: true,
  });

  const picked = new Set([first?.userId, second?.userId].filter(Boolean).map(id => normId(id!)));
  const wanted = new Set(spaceIds.map(normId));
  const debatesOf = (person: DebatePerson) => facts.records.get(person.profile_space_id)?.debatesArgued ?? 0;
  const listedRoster = rosterPeople
    .filter(person => !picked.has(normId(person.user_id)))
    .filter(person => !searchTerm || speakerLabel(person).toLowerCase().includes(searchTerm))
    .filter(
      person =>
        wanted.size === 0 ||
        (facts.debateSpacesByPerson.get(person.profile_space_id) ?? []).some(spaceId => wanted.has(spaceId))
    )
    .sort(
      byPairFit<DebatePerson>(
        {
          available: fitRanking,
          fitOf,
          sharedFreeSlotsOf: person => freeSlots.get(normId(person.user_id)),
        },
        (left, right) =>
          (ranking ? matchCount(right) - matchCount(left) : 0) ||
          debatesOf(right) - debatesOf(left) ||
          speakerLabel(left).localeCompare(speakerLabel(right))
      )
    );
  // People without availability come from search alone, after everyone who can be picked.
  const listedHits = hitPeople.filter(person => !picked.has(normId(person.user_id)));

  const prompt = useAdminAvailabilityPrompt();
  const requestAvailability = async (userIds: string[]) => {
    // Never twice: a double press, or asking both when one was already asked, would email again.
    const toAsk = userIds.filter(userId => !SETTLED_PROMPTS.has(promptsRef.current.get(normId(userId)) ?? 'error'));
    for (const userId of toAsk) setPrompt(userId, 'pending');
    for (const userId of toAsk) {
      let outcome: PromptOutcome;
      try {
        outcome = (await prompt.mutateAsync(userId)).sent ? 'sent' : 'no_email';
      } catch (error) {
        outcome = isDebateProfileMissing(error) ? 'not_on_debates' : 'error';
      }
      setPrompt(userId, outcome);
    }
  };

  const pick = (person: DebatePerson) => {
    const next = { userId: person.user_id, person };
    if (!first) setFirst(next);
    else setSecond(next);
    search.onQueryChange('');
  };
  const clear = (which: 'first' | 'second') => {
    if (which === 'first') setFirst(second);
    setSecond(null);
  };

  const [chosen, setChosen] = React.useState<Choice | null>(null);
  const create = useCreateAdminMatch();
  const send = () => {
    if (!first || !second || !chosen) return;
    create.mutate(
      { firstUserId: first.userId, secondUserId: second.userId, start: new Date(chosen.start) },
      {
        onSuccess: () => onSent(`Invites sent to ${speakerLabel(first.person)} and ${speakerLabel(second.person)}.`),
      }
    );
  };

  const option = (person: DebatePerson, available: boolean) => {
    const personFit = available && fitRanking ? fitOf(person) : undefined;
    return (
      <PersonOption
        key={person.user_id}
        person={person}
        available={available}
        fitReason={
          personFit && first
            ? fitReasonText(personFit.reason, debaterFirstName(first.person), personFit.parts.opposed)
            : null
        }
        noSharedTime={available && fitRanking && freeSlots.get(normId(person.user_id)) === 0}
        record={available ? (facts.records.get(person.profile_space_id) ?? null) : null}
        matches={available && ranking ? matchCount(person) : null}
        matchesWith={first ? debaterFirstName(first.person) : null}
        prompt={prompts.get(normId(person.user_id))}
        onPick={() => pick(person)}
        onRequest={() => void requestAvailability([person.user_id])}
      />
    );
  };

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,24rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-5 md:flex md:flex-col">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <PickBox label="Debater 1" picked={first} active={!first} onClear={() => clear('first')} />
            <PickBox
              label="Debater 2"
              picked={second}
              active={Boolean(first) && !second}
              onClear={() => clear('second')}
            />
          </div>
          <Input
            withSearchIcon
            value={search.query}
            onChange={event => search.onQueryChange(event.currentTarget.value)}
            placeholder="Search people"
            aria-label="Search people"
          />
          <SpaceFilterPills
            analyticsSurface="calendar"
            facetSpaces={facetSpaces}
            spaceIds={spaceIds}
            onSpaceToggle={onSpaceToggle}
            onSpacesClear={onSpacesClear}
            loading={facts.publishableSpacesPending}
            countsPending={facts.personRecordsPending}
          />
          <Text as="p" variant="footnote" color="grey-04">
            {!first
              ? 'People with availability, most debates first'
              : fitRanking
                ? `Ordered by fit with ${speakerLabel(first.person)}: disagreements, shared interests and free time`
                : ranking
                  ? `Ordered by matches with ${speakerLabel(first.person)}, most first`
                  : `Counting matches with ${speakerLabel(first.person)}…`}
          </Text>
          <ul aria-label="People" className="min-h-0 flex-1 overflow-y-auto border-t border-grey-02">
            {debatersQuery.error && !debatersQuery.data ? (
              // Not an empty roster: nobody could be picked, and saying "nobody matches" would hide that.
              <li className="flex flex-wrap items-center gap-2 border-b border-grey-02 py-4">
                <Text as="p" variant="metadata" color="grey-04">
                  Couldn&rsquo;t load the people with availability.
                </Text>
                <HubPillButton analyticsSurface="calendar" onClick={() => void debatersQuery.refetch()}>
                  Try again
                </HubPillButton>
              </li>
            ) : null}
            {debatersQuery.error && !debatersQuery.data ? (
              listedHits.map(person => option(person, false))
            ) : debatersQuery.isPending && listedRoster.length === 0 ? (
              <EmptyRow>Loading people…</EmptyRow>
            ) : listedRoster.length === 0 && listedHits.length === 0 ? (
              <EmptyRow>{searchTerm && search.isLoading ? 'Searching…' : 'Nobody matches that.'}</EmptyRow>
            ) : (
              <>
                {listedRoster.map(person => option(person, true))}
                {listedHits.map(person => option(person, false))}
              </>
            )}
          </ul>
        </div>

        <TimePicker
          key={`${first?.userId ?? ''}-${second?.userId ?? ''}`}
          first={first}
          second={second}
          prompts={prompts}
          onChoose={setChosen}
          onRequestBoth={() => first && second && void requestAvailability([first.userId, second.userId])}
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-grey-02 pt-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {first && second && chosen ? (
            <>
              <Text as="p" variant="metadataMedium" className="truncate">
                {speakerLabel(first.person)} vs {speakerLabel(second.person)}
              </Text>
              <Text as="p" variant="footnote" color="grey-04">
                {new Date(chosen.start).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · {timeIn(chosen.start, undefined)} – {timeIn(chosen.start + SLOT_MINUTES * 60_000, undefined)} your
                time
              </Text>
              {chosen.outside ? (
                <Text as="p" variant="footnote" className="text-purple">
                  Not a time they&rsquo;re both free. The invite is flagged, and the calendar tags it Off-hours.
                </Text>
              ) : null}
            </>
          ) : (
            <Text as="p" variant="footnote" color="grey-04">
              {first && second ? 'Pick a time.' : 'Pick two debaters, then a time.'}
            </Text>
          )}
          <div role="alert">
            {create.error ? (
              <Text as="p" variant="footnote" className="text-red-01">
                Couldn&rsquo;t send the invites.{' '}
                {create.error instanceof GeoChatRequestError ? create.error.message : 'Try again.'}
              </Text>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HubPillButton analyticsSurface="calendar" analyticsLabel="New match Cancel" onClick={onClose}>
            Cancel
          </HubPillButton>
          <HubPillButton
            analyticsSurface="calendar"
            analyticsLabel="New match Send invites"
            variant="primary"
            disabled={!first || !second || !chosen}
            pending={create.isPending}
            pendingLabel="Sending…"
            onClick={send}
          >
            Send invites
          </HubPillButton>
        </div>
      </div>
    </>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="py-4">
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
    </li>
  );
}

function PickBox({
  label,
  picked,
  active,
  onClear,
}: {
  label: string;
  picked: Picked | null;
  active: boolean;
  onClear: () => void;
}) {
  if (!picked) {
    return (
      <div
        className={cx(
          'flex min-h-14 items-center rounded-lg border border-dashed border-grey-02 px-2.5',
          active && 'shadow-inner-text'
        )}
      >
        <Text as="span" variant="metadata" color="grey-04">
          {label}
        </Text>
      </div>
    );
  }
  return (
    <div className="flex min-h-14 min-w-0 items-center gap-2 rounded-lg border border-grey-02 px-2.5">
      <DebaterFace summary={picked.person} fallbackId={picked.userId} size={28} />
      <Text as="span" variant="metadataMedium" className="min-w-0 flex-1 truncate">
        {speakerLabel(picked.person)}
      </Text>
      <button
        type="button"
        aria-label={`Remove ${speakerLabel(picked.person)}`}
        onClick={onClear}
        className="grid size-5 shrink-0 place-items-center rounded-full text-grey-04 hover:bg-grey-01 hover:text-text"
      >
        <CloseSmall />
      </button>
    </div>
  );
}

const PROMPT_LABELS: Record<Exclude<PromptOutcome, 'pending'>, string> = {
  sent: 'Request sent',
  no_email: 'No email on file',
  not_on_debates: 'Hasn’t joined debates',
  error: 'Couldn’t send. Try again later.',
};

function PersonOption({
  person,
  available,
  record,
  matches,
  matchesWith,
  fitReason,
  noSharedTime,
  prompt,
  onPick,
  onRequest,
}: {
  person: DebatePerson;
  available: boolean;
  /** Why they fit debater 1 (GEO-3224), when pair fit is ranking the list. */
  fitReason: string | null;
  /** Pair fit is ranking and they share no free half-hour with debater 1. */
  noSharedTime: boolean;
  record: PersonRecord | null;
  /** Matches with debater 1, once known; null hides the count. */
  matches: number | null;
  matchesWith: string | null;
  prompt: PromptOutcome | undefined;
  onPick: () => void;
  onRequest: () => void;
}) {
  const name = speakerLabel(person);
  const matchPill =
    matches !== null && matchesWith ? (
      <span
        className={cx(
          'rounded-full px-1.5 py-0.5 font-medium',
          matches > 0 ? 'bg-ctaTertiary text-ctaPrimary' : 'bg-grey-01 text-grey-04'
        )}
      >
        {matches} {matches === 1 ? 'match' : 'matches'} with {matchesWith}
      </span>
    ) : null;

  let action: React.ReactNode;
  if (available) {
    action = (
      <HubPillButton
        analyticsSurface="calendar"
        analyticsLabel="New match Select"
        aria-label={`Select ${name}`}
        onClick={onPick}
      >
        Select
      </HubPillButton>
    );
  } else if (prompt && prompt !== 'pending' && prompt !== 'error') {
    action = (
      <Text
        as="span"
        variant="footnote"
        className={cx('pt-1.5 text-right', prompt === 'sent' ? POSITIVE_TEXT_CLASS : 'text-grey-04')}
      >
        {PROMPT_LABELS[prompt]}
      </Text>
    );
  } else {
    action = (
      <HubPillButton
        analyticsSurface="calendar"
        analyticsLabel="New match Request availability"
        aria-label={`Request availability from ${name}`}
        pending={prompt === 'pending'}
        pendingLabel="Sending…"
        onClick={onRequest}
      >
        Request availability
      </HubPillButton>
    );
  }

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-2.5 border-b border-grey-02 py-2.5 last:border-b-0">
      <DebaterFace summary={person} fallbackId={person.user_id} size={32} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" variant="metadataMedium" className="truncate">
          {name}
        </Text>
        <PersonRecordLine record={record} match={matchPill} />
        {fitReason || noSharedTime ? (
          <Text as="span" variant="footnote" color="grey-04" className="truncate">
            {[fitReason, noSharedTime ? 'No free time in common' : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {available ? null : (
          <Text as="span" variant="footnote" color="grey-04">
            No availability set. Can&rsquo;t be matched until they set it.
          </Text>
        )}
        {prompt === 'error' ? (
          <Text as="span" variant="footnote" className="text-red-01">
            {PROMPT_LABELS.error}
          </Text>
        ) : null}
      </div>
      {action}
    </li>
  );
}

/** The next fourteen local midnights, today first: the days a match can be booked on. */
function bookableDays(): Date[] {
  const today = new Date();
  return Array.from(
    { length: ADMIN_MATCH_DAYS },
    (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + index)
  );
}

/**
 * `minutes` past midnight on `day`, by the wall clock. Built from parts rather than by adding
 * milliseconds, which lands an hour off on a day the clocks change.
 */
function atMinutes(day: Date, minutes: number): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
}

function dayHeading(day: Date) {
  return day.toDateString() === new Date().toDateString()
    ? 'Today'
    : day.toLocaleDateString(undefined, { weekday: 'short' });
}

const MODE_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'any', label: 'Pick any time' },
] as const;

/**
 * Choose a time: Recommended (the half-hours both are free) or Pick any time (the override). Every
 * time is the admin's, with each debater's own clock under it once their zone is known.
 */
function TimePicker({
  first,
  second,
  prompts,
  onChoose,
  onRequestBoth,
}: {
  first: Picked | null;
  second: Picked | null;
  prompts: ReadonlyMap<string, PromptOutcome>;
  onChoose: (choice: Choice | null) => void;
  onRequestBoth: () => void;
}) {
  const [mode, setMode] = React.useState<'recommended' | 'any'>('recommended');
  const [selected, setSelected] = React.useState<number | null>(null);
  const days = React.useMemo(bookableDays, []);
  const [anyDay, setAnyDay] = React.useState(1);
  const [anyMinutes, setAnyMinutes] = React.useState(17 * 60);

  // Ticks each minute, so a picked time that passes while the dialog is open stops being sendable.
  const now = useMinuteClock();
  const overlap = useAdminPairOverlap(first?.userId ?? null, second?.userId ?? null);
  const candidate = overlap.data?.candidates[0];
  const firstZone = overlap.data?.viewer_timezone || undefined;
  const secondZone = candidate?.with_timezone || undefined;
  const slots = React.useMemo(
    () => (candidate?.slots ?? []).map(slot => Date.parse(slot.start)).filter(start => start > now),
    [candidate, now]
  );
  const mutual = React.useMemo(() => new Set(slots), [slots]);
  // Whether a time is outside their availability is only known once the overlap has answered in
  // full; until then the override says nothing rather than flagging every time it is shown.
  const overlapKnown = overlap.data !== undefined && !candidate?.truncated;

  const anyStart = days[anyDay] ? atMinutes(days[anyDay], anyMinutes) : null;
  React.useEffect(() => {
    if (mode === 'recommended')
      onChoose(selected !== null && selected > now ? { start: selected, outside: false } : null);
    else
      onChoose(
        anyStart !== null && anyStart > now
          ? { start: anyStart, outside: overlapKnown ? !mutual.has(anyStart) : null }
          : null
      );
  }, [anyStart, mode, mutual, now, onChoose, overlapKnown, selected]);

  const box = (children: React.ReactNode) => (
    <div className="flex min-h-[28rem] min-w-0 flex-col gap-3 rounded-xl border border-grey-02 p-3.5 md:min-h-0">
      {children}
    </div>
  );

  if (!first || !second) {
    return box(
      <>
        <Text as="p" variant="metadataMedium">
          Choose a time
        </Text>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Text as="p" variant="metadata" color="grey-04">
            Pick two debaters to see when they&rsquo;re both free.
          </Text>
          <Text as="p" variant="footnote" color="grey-04">
            Only people who have set availability can be picked. For anyone else, use Request availability.
          </Text>
        </div>
      </>
    );
  }

  const a = debaterFirstName(first.person);
  const b = debaterFirstName(second.person);
  const theirClocks = [
    { name: a, zone: firstZone },
    { name: b, zone: secondZone },
  ].filter((clock): clock is { name: string; zone: string } => clock.zone !== undefined);

  let body: React.ReactNode;
  if (mode === 'recommended') {
    if (overlap.isPending) {
      body = (
        <Text as="p" variant="metadata" color="grey-04">
          Finding times they&rsquo;re both free…
        </Text>
      );
    } else if (overlap.error) {
      body = (
        <div className="flex flex-col items-start gap-2">
          <Text as="p" variant="metadata" color="grey-04">
            Couldn&rsquo;t load their shared times.
          </Text>
          <HubPillButton analyticsSurface="calendar" onClick={() => void overlap.refetch()}>
            Try again
          </HubPillButton>
        </div>
      );
    } else if (slots.length === 0) {
      const outcomes = [first, second].map(person => prompts.get(normId(person.userId)));
      const asking = outcomes.includes('pending');
      const asked = outcomes.every(outcome => outcome !== undefined && SETTLED_PROMPTS.has(outcome));
      body = (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Text as="p" variant="metadataMedium">
            {a} and {b} have both set availability, but it never overlaps in the next two weeks.
          </Text>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <HubPillButton
              analyticsSurface="calendar"
              analyticsLabel="New match Pick any time"
              onClick={() => setMode('any')}
            >
              Pick any time
            </HubPillButton>
            {asked && !asking ? (
              <Text as="span" variant="footnote" color="grey-04">
                {[a, b]
                  .map((name, index) => {
                    const outcome = outcomes[index];
                    return outcome === 'sent' ? `Asked ${name}` : `${name}: ${PROMPT_LABELS[outcome as 'no_email']}`;
                  })
                  .join(' · ')}
              </Text>
            ) : (
              <HubPillButton
                analyticsSurface="calendar"
                analyticsLabel="New match Ask both to widen availability"
                pending={asking}
                pendingLabel="Sending…"
                onClick={onRequestBoth}
              >
                Ask both to widen availability
              </HubPillButton>
            )}
          </div>
        </div>
      );
    } else {
      body = (
        <>
          <Text as="p" variant="footnote" color="grey-04">
            Half-hours they&rsquo;re both free. The large time is yours; under it, each debater&rsquo;s own.
          </Text>
          <div className="grid auto-cols-[minmax(7rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1">
            {days
              .map(day => ({
                day,
                starts: slots.filter(start => new Date(start).toDateString() === day.toDateString()),
              }))
              .filter(({ starts }) => starts.length > 0)
              .map(({ day, starts }) => (
                <section
                  key={day.getTime()}
                  role="group"
                  aria-label={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  className="flex flex-col gap-2 rounded-lg border border-grey-02 p-2"
                >
                  <div className="flex flex-col">
                    <Text as="span" variant="metadataMedium">
                      {dayHeading(day)}
                    </Text>
                    <Text as="span" variant="footnote" color="grey-04">
                      {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  </div>
                  {starts.map(start => (
                    <button
                      key={start}
                      type="button"
                      aria-pressed={selected === start}
                      aria-label={[
                        timeIn(start, undefined),
                        ...theirClocks.map(({ name, zone }) => `${name} ${timeIn(start, zone)}`),
                      ].join(', ')}
                      onClick={() => setSelected(current => (current === start ? null : start))}
                      className={cx(
                        'rounded-md border px-2 py-1 text-left tabular-nums transition-colors',
                        selected === start ? SELECTED_SLOT : cx(MUTUAL_SLOT, 'hover:border-text')
                      )}
                    >
                      <span className="block text-footnoteMedium">{timeIn(start, undefined)}</span>
                      {theirClocks.map(({ name, zone }) => (
                        <span key={name} className="block text-footnote whitespace-nowrap opacity-70">
                          {name} {timeIn(start, zone)}
                        </span>
                      ))}
                    </button>
                  ))}
                </section>
              ))}
          </div>
        </>
      );
    }
  } else {
    const inside = anyStart !== null && mutual.has(anyStart);
    const future = anyStart !== null && anyStart > now;
    body = (
      <>
        <Text as="p" variant="footnote" color="grey-04">
          Any time, including outside their availability. A time they aren&rsquo;t both free is flagged on the invite
          and tagged Off-hours on the calendar.
        </Text>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <Text as="span" variant="footnote" color="grey-04">
              Day
            </Text>
            <select
              value={anyDay}
              onChange={event => setAnyDay(Number(event.currentTarget.value))}
              className="h-9 rounded px-2.5 text-metadata shadow-inner shadow-grey-02"
            >
              {days.map((day, index) => (
                <option key={day.getTime()} value={index}>
                  {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Text as="span" variant="footnote" color="grey-04">
              Starts (your time)
            </Text>
            <select
              value={anyMinutes}
              onChange={event => setAnyMinutes(Number(event.currentTarget.value))}
              className="h-9 rounded px-2.5 text-metadata shadow-inner shadow-grey-02"
            >
              {Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, index) => index * SLOT_MINUTES).map(minutes => (
                <option key={minutes} value={minutes}>
                  {timeIn(atMinutes(days[0], minutes), undefined)}
                </option>
              ))}
            </select>
          </label>
          <Text as="span" variant="footnote" color="grey-04" className="pb-2.5">
            {SLOT_MINUTES} minutes
          </Text>
        </div>
        {anyStart !== null && !future ? (
          <Text as="p" variant="footnote" className="text-red-01">
            That time has passed.
          </Text>
        ) : null}
        {anyStart !== null && future && theirClocks.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2">
            {theirClocks.map(({ name, zone }) => (
              <div
                key={name}
                className={cx(
                  'flex flex-col gap-0.5 rounded-lg border px-3 py-2.5',
                  !overlapKnown || inside ? 'border-grey-02' : 'border-purple bg-purple/10'
                )}
              >
                <Text as="span" variant="metadataMedium">
                  {name}
                </Text>
                <Text as="span" variant="metadata">
                  {timeIn(anyStart, zone)} in {zoneCity(zone)}
                  {dayShift(anyStart, zone)}
                </Text>
              </div>
            ))}
          </div>
        ) : null}
        {anyStart !== null && future ? (
          <Text
            as="p"
            variant="footnote"
            className={!overlapKnown ? 'text-grey-04' : inside ? 'text-grey-04' : 'text-purple'}
          >
            {!overlapKnown
              ? 'Checking whether they’re both free then…'
              : inside
                ? 'They’re both free then.'
                : 'Not a time they’re both free.'}
          </Text>
        ) : null}
      </>
    );
  }

  return box(
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="p" variant="metadataMedium">
          Choose a time
        </Text>
        <SegmentedControl label="How to pick a time" options={MODE_OPTIONS} value={mode} onChange={setMode} />
      </div>
      {body}
    </>
  );
}

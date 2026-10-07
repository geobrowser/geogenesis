'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { useSearch } from '~/core/hooks/use-search';
import { normId } from '~/core/utils/norm-id';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

import { MUTUAL_SLOT, SELECTED_SLOT } from '~/partials/availability/peer-availability';

import { type DebatePerson, GeoChatRequestError, isDebateProfileMissing } from '../api';
import { speakerLabel } from '../playback-utils';
import { dayShift, timeIn, zoneCity } from './admin-debate-calendar-model';
import {
  ADMIN_MATCH_DAYS,
  useAdminAvailabilityPrompt,
  useAdminDebaters,
  useAdminPairOverlap,
  useCreateAdminMatch,
} from './admin-hooks';
import { HubPillButton } from './hub-pill-button';
import { PersonRecordLine } from './person-record-line';
import { SpaceFilterPills } from './space-filter-pills';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { usePersonFacts } from './use-person-facts';
import { useSpaceFilterMenu } from './use-space-filter-selection';

const SLOT_MS = 30 * 60_000;
const EMPTY_SPACE_IDS: string[] = [];

/** What became of asking someone to set their availability. */
type PromptOutcome = 'pending' | 'sent' | 'no_email' | 'not_on_debates' | 'error';

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
 *   measured from that person instead of the viewer.
 * - **Recommended** offers the half-hours both are free; **Pick any time** is the override, kept a
 *   separate mode so nobody drifts into it. Every time shows both debaters' own clocks.
 *
 * Drives the Radix primitives directly, as the availability modal does: it needs more width than
 * the shared `Dialog` allows.
 */
export function AdminNewMatchDialog({ open, onOpenChange, openerRef, onSent }: Props) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className={cx('fixed inset-0 bg-text/20', Z_LAYER_CLASS.scheduleDialogBackdrop)} />
        <Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            if (!openerRef?.current) return;
            event.preventDefault();
            openerRef.current.focus();
          }}
          className={cx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-hidden md:inset-0 md:translate-x-0 md:translate-y-0',
            Z_LAYER_CLASS.scheduleDialog
          )}
        >
          <div
            data-no-sheet-drag
            className="flex max-h-[calc(100dvh-2rem)] w-[68rem] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden rounded-xl bg-white p-5 shadow-card md:h-dvh md:max-h-dvh md:w-screen md:max-w-none md:gap-3 md:overflow-y-auto md:rounded-none md:p-4"
          >
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Title asChild>
                  <Text as="h2" variant="smallTitle">
                    New match
                  </Text>
                </Title>
                <Text as="p" variant="footnote" color="grey-04">
                  Both debaters get an invite, the same as when one person asks another.
                </Text>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="grid size-4 shrink-0 place-items-center text-[#151515] transition-opacity hover:opacity-70"
              >
                <Close />
              </button>
            </div>
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
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

type Picked = { userId: string; person: DebatePerson };

function NewMatchBody({ onClose, onSent }: { onClose: () => void; onSent: (note: string) => void }) {
  const [first, setFirst] = React.useState<Picked | null>(null);
  const [second, setSecond] = React.useState<Picked | null>(null);
  const [spaceIds, setSpaceIds] = React.useState<string[]>(EMPTY_SPACE_IDS);
  const [prompts, setPrompts] = React.useState<ReadonlyMap<string, PromptOutcome>>(new Map());

  const debatersQuery = useAdminDebaters(true);
  const availableIds = React.useMemo(
    () => new Set((debatersQuery.data ?? []).map(debater => normId(debater.user_id))),
    [debatersQuery.data]
  );

  // Geo search for people by name: how anyone without availability is found at all. A geo-chat user
  // id is the page entity of their personal space, so a person hit is a candidate id as it stands;
  // the summaries lookup below keeps only the hits that front a personal space.
  const search = useSearch({ filterByTypes: [SystemIds.PERSON_TYPE], restrictToFilterTypes: true });
  const searchTerm = search.query.trim().toLowerCase();
  const hitIds = React.useMemo(
    () => (searchTerm ? search.results.map(result => normId(result.id)) : []),
    [search.results, searchTerm]
  );

  const candidateIds = React.useMemo(() => [...new Set([...availableIds, ...hitIds])], [availableIds, hitIds]);
  const summaries = useGeoChatUserSummaries(candidateIds, candidateIds.length > 0);
  const people = React.useMemo<DebatePerson[]>(
    () =>
      summaries.map(summary => ({
        ...summary,
        online: false,
        available_to_debate: false,
        in_debate: false,
        online_since: null,
        can_challenge: false,
      })),
    [summaries]
  );

  const facts = usePersonFacts(people, {
    authenticated: true,
    rosterUnavailable: debatersQuery.isPending,
    anchorProfileSpaceId: first ? first.person.profile_space_id : null,
  });
  const matchCount = (person: DebatePerson) =>
    facts.matchAnalysis.byProfile.get(normId(person.profile_space_id))?.length ?? 0;
  const hasAvailability = (person: DebatePerson) => availableIds.has(normId(person.user_id));

  const offeredSpaces = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) {
      for (const spaceId of facts.debateSpacesByPerson.get(person.profile_space_id) ?? []) {
        counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
      }
    }
    for (const spaceId of spaceIds) if (!counts.has(normId(spaceId))) counts.set(normId(spaceId), 0);
    return [...counts].map(([id, count]) => ({ id, name: null, count }));
  }, [facts.debateSpacesByPerson, people, spaceIds]);
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
  const listed = people
    .filter(person => !picked.has(normId(person.user_id)))
    .filter(person => !searchTerm || speakerLabel(person).toLowerCase().includes(searchTerm))
    .filter(
      person =>
        wanted.size === 0 ||
        (facts.debateSpacesByPerson.get(person.profile_space_id) ?? []).some(spaceId => wanted.has(spaceId))
    )
    .sort((left, right) => {
      const debates = (person: DebatePerson) => facts.records.get(person.profile_space_id)?.debatesArgued ?? 0;
      const available = (person: DebatePerson) => (hasAvailability(person) ? 1 : 0);
      return (
        (first ? matchCount(right) - matchCount(left) : 0) ||
        available(right) - available(left) ||
        debates(right) - debates(left) ||
        speakerLabel(left).localeCompare(speakerLabel(right))
      );
    });

  const prompt = useAdminAvailabilityPrompt();
  const requestAvailability = async (userIds: string[]) => {
    setPrompts(current => new Map([...current, ...userIds.map(id => [normId(id), 'pending'] as const)]));
    for (const userId of userIds) {
      let outcome: PromptOutcome;
      try {
        outcome = (await prompt.mutateAsync(userId)).sent ? 'sent' : 'no_email';
      } catch (error) {
        outcome = isDebateProfileMissing(error) ? 'not_on_debates' : 'error';
      }
      setPrompts(current => new Map(current).set(normId(userId), outcome));
    }
  };

  const pick = (person: DebatePerson) => {
    const next = { userId: person.user_id, person };
    if (!first) setFirst(next);
    else setSecond(next);
    search.onQueryChange('');
  };
  const clear = (which: 'first' | 'second') => {
    if (which === 'first') {
      setFirst(second);
      setSecond(null);
    } else setSecond(null);
  };

  const [chosen, setChosen] = React.useState<{ start: number; outside: boolean } | null>(null);
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
            {first
              ? `Ordered by matches with ${speakerLabel(first.person)}, most first`
              : 'People with availability first'}
          </Text>
          <ul aria-label="People" className="min-h-0 flex-1 overflow-y-auto border-t border-grey-02 md:max-h-none">
            {debatersQuery.isPending && listed.length === 0 ? (
              <li className="py-4">
                <Text as="p" variant="metadata" color="grey-04">
                  Loading people…
                </Text>
              </li>
            ) : listed.length === 0 ? (
              <li className="py-4">
                <Text as="p" variant="metadata" color="grey-04">
                  {searchTerm && search.isLoading ? 'Searching…' : 'Nobody matches that.'}
                </Text>
              </li>
            ) : (
              listed.map(person => (
                <PersonOption
                  key={person.user_id}
                  person={person}
                  available={hasAvailability(person)}
                  record={facts.records.get(person.profile_space_id) ?? null}
                  matches={first ? matchCount(person) : null}
                  matchesWith={first ? firstName(first.person) : null}
                  prompt={prompts.get(normId(person.user_id))}
                  onPick={() => pick(person)}
                  onRequest={() => void requestAvailability([person.user_id])}
                />
              ))
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
                · {timeIn(chosen.start, undefined)} – {timeIn(chosen.start + SLOT_MS, undefined)} your time
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

function firstName(person: DebatePerson) {
  return person.display_name?.trim().split(/\s+/)[0] ?? speakerLabel(person);
}

function Face({ person, size }: { person: DebatePerson; size: 28 | 32 }) {
  return (
    // An image avatar fills its parent, so the box sets the size.
    <div className={cx('shrink-0 overflow-hidden rounded-full', size === 28 ? 'h-7 w-7' : 'h-8 w-8')}>
      <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={size} />
    </div>
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
      <Face person={picked.person} size={28} />
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
  prompt,
  onPick,
  onRequest,
}: {
  person: DebatePerson;
  available: boolean;
  record: Parameters<typeof PersonRecordLine>[0]['record'];
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
        className={cx('pt-1.5 text-right', prompt === 'sent' ? 'text-[#0b7a59]' : 'text-grey-04')}
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
      <Face person={person} size={32} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" variant="metadataMedium" className="truncate">
          {name}
        </Text>
        <PersonRecordLine record={record} match={matchPill} />
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
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: ADMIN_MATCH_DAYS }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() + index);
    return day;
  });
}

function dayHeading(day: Date) {
  return day.toDateString() === new Date().toDateString()
    ? 'Today'
    : day.toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * Choose a time: Recommended (the half-hours both are free) or Pick any time (the override). Every
 * time is the admin's, with each debater's own clock under it.
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
  onChoose: (choice: { start: number; outside: boolean } | null) => void;
  onRequestBoth: () => void;
}) {
  const [mode, setMode] = React.useState<'recommended' | 'any'>('recommended');
  const [selected, setSelected] = React.useState<number | null>(null);
  const days = React.useMemo(bookableDays, []);
  const [anyDay, setAnyDay] = React.useState(1);
  const [anyMinutes, setAnyMinutes] = React.useState(17 * 60);

  const overlap = useAdminPairOverlap(first?.userId ?? null, second?.userId ?? null);
  const candidate = overlap.data?.candidates[0];
  const firstZone = overlap.data?.viewer_timezone || undefined;
  const secondZone = candidate?.with_timezone || undefined;
  // Trimmed to times still ahead when the answer lands, not on every render.
  const slots = React.useMemo(() => {
    const cutoff = Date.now();
    return (candidate?.slots ?? []).map(slot => Date.parse(slot.start)).filter(start => start > cutoff);
  }, [candidate]);
  const mutual = React.useMemo(() => new Set(slots), [slots]);

  const anyStart = days[anyDay] ? days[anyDay].getTime() + anyMinutes * 60_000 : null;
  React.useEffect(() => {
    if (mode === 'recommended') onChoose(selected !== null ? { start: selected, outside: false } : null);
    else
      onChoose(anyStart !== null && anyStart > Date.now() ? { start: anyStart, outside: !mutual.has(anyStart) } : null);
  }, [anyStart, mode, mutual, onChoose, selected]);

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

  const a = firstName(first.person);
  const b = firstName(second.person);
  const local = (at: number) => (
    <>
      <span className="block text-footnote whitespace-nowrap opacity-70">
        {a} {timeIn(at, firstZone)}
      </span>
      <span className="block text-footnote whitespace-nowrap opacity-70">
        {b} {timeIn(at, secondZone)}
      </span>
    </>
  );

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
      const asked = prompts.get(normId(first.userId)) === 'sent' && prompts.get(normId(second.userId)) === 'sent';
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
            {asked ? (
              <Text as="span" variant="footnote" className="text-[#0b7a59]">
                Asked both to widen their availability
              </Text>
            ) : (
              <HubPillButton
                analyticsSurface="calendar"
                analyticsLabel="New match Ask both to widen availability"
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
                      aria-label={`${timeIn(start, undefined)}, ${a} ${timeIn(start, firstZone)}, ${b} ${timeIn(start, secondZone)}`}
                      onClick={() => setSelected(current => (current === start ? null : start))}
                      className={cx(
                        'rounded-md border px-2 py-1 text-left tabular-nums transition-colors',
                        selected === start ? SELECTED_SLOT : cx(MUTUAL_SLOT, 'hover:border-text')
                      )}
                    >
                      <span className="block text-footnoteMedium">{timeIn(start, undefined)}</span>
                      {local(start)}
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
              {Array.from({ length: 48 }, (_, index) => index * 30).map(minutes => (
                <option key={minutes} value={minutes}>
                  {timeIn(new Date(2026, 0, 1, 0, minutes).getTime(), undefined)}
                </option>
              ))}
            </select>
          </label>
          <Text as="span" variant="footnote" color="grey-04" className="pb-2.5">
            30 minutes
          </Text>
        </div>
        {anyStart !== null && anyStart <= Date.now() ? (
          <Text as="p" variant="footnote" className="text-red-01">
            That time has passed.
          </Text>
        ) : anyStart !== null ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2">
            {[
              { name: speakerLabel(first.person), zone: firstZone },
              { name: speakerLabel(second.person), zone: secondZone },
            ].map(({ name, zone }) => (
              <div
                key={name}
                className={cx(
                  'flex flex-col gap-0.5 rounded-lg border px-3 py-2.5',
                  inside ? 'border-grey-02' : 'border-purple bg-purple/10'
                )}
              >
                <Text as="span" variant="metadataMedium">
                  {name}
                </Text>
                <Text as="span" variant="metadata">
                  {timeIn(anyStart, zone)}
                  {zone ? ` in ${zoneCity(zone)}${dayShift(anyStart, zone)}` : ''}
                </Text>
              </div>
            ))}
          </div>
        ) : null}
        {anyStart !== null && anyStart > Date.now() ? (
          <Text as="p" variant="footnote" className={inside ? 'text-grey-04' : 'text-purple'}>
            {inside ? 'They’re both free then.' : 'Not a time they’re both free.'}
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
        <div
          role="radiogroup"
          aria-label="How to pick a time"
          className="flex rounded-full border border-grey-02 p-0.5"
        >
          {(
            [
              { value: 'recommended', label: 'Recommended' },
              { value: 'any', label: 'Pick any time' },
            ] as const
          ).map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cx(
                'rounded-full px-3 py-1 text-metadata transition-colors',
                mode === option.value ? 'bg-text text-white' : 'text-grey-04 hover:text-text'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {body}
    </>
  );
}

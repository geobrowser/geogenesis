'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { useSetToast } from '~/core/hooks/use-toast';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { type DebateLobbySummary, dashlessId } from '../api';
import { useGeoChatAuth } from '../hooks';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { debateRoomPath } from '../rooms/room-routes';
import { debateHours, debateHoursLobbies, debateHoursRange } from './debate-hours';
import { useDebateLobbies, useDebateLobbyCalendar } from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { goingLabel, personName, rsvpLabel } from './lobby-format';
import { LobbyByline, LobbyHostNames } from './lobby-host-names';
import { LobbyReminderError, useLobbyReminderPress } from './lobby-reminder-press';
import { lobbyBadgeTime, lobbyDayLabel, lobbyWhenLabel } from './upcoming-lobbies';
import { useMinuteNow } from './use-minute-now';

/**
 * Where "Join debate hours" on the marketing home page lands (GEO-3517). A newcomer sees the week's
 * debate hours (scheduled lobbies), RSVPs to one, and signs up on the way if they need to.
 *
 * Laid out in the marketing site's language rather than the app's, since that is the page the
 * visitor just left: Geist (the route loads it), ink #151515 with 60% ink for the quiet half of a
 * headline, the brand palette for colour, 44px pills. The parts that are app behaviour (the lobby
 * list, RSVP and its signed-out queue, host bylines) are the same ones the debates panel uses.
 *
 * Signed out, only hosts are identified: they list a lobby publicly. Who else is going is a count.
 */
export function DebateHoursPage({ className }: { className?: string }) {
  // Keeps the list live for a signed-in viewer; signed out the list polls instead.
  useMatchmakingScope(true);
  const lobbies = useDebateLobbies();
  const now = useMinuteNow();
  const { from, to } = debateHoursRange(now);
  const calendar = useDebateLobbyCalendar(from, to, true, { signedOut: true });
  // Waits for the calendar, so a host's later lobbies do not pop in after the page draws. If it
  // fails, the list alone: every room open now, and most of the week.
  const calendarSettled = calendar.data !== undefined || calendar.isError;
  const week = React.useMemo(
    () =>
      lobbies.data && calendarSettled ? debateHoursLobbies(lobbies.data.lobbies, calendar.data?.lobbies) : undefined,
    [calendar.data, calendarSettled, lobbies.data]
  );
  const hours = React.useMemo(() => (week ? debateHours(week, now) : null), [week, now]);
  useGoingToast(week);

  const upcomingCount = hours ? hours.rest.length + (hours.featured ? 1 : 0) : 0;

  return (
    <div className={cx('w-full bg-white text-[#151515]', className)} data-testid="debate-hours-page">
      <section
        aria-labelledby="debate-hours-title"
        className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)_440px] items-center gap-16 px-10 pt-20 pb-16 md:px-6 md:pt-10 md:pb-10 lg:grid-cols-1 lg:gap-10"
      >
        <div className="flex flex-col gap-7 md:gap-5">
          <h1
            id="debate-hours-title"
            className="text-[64px] leading-[66px] font-semibold tracking-[-2.56px] md:text-[40px] md:leading-[45px] md:tracking-[-1.6px]"
          >
            <span className="text-[#151515]/60">Bring your perspective.</span> Join a live debate this week.
          </h1>
          <p className="max-w-[540px] text-[22px] leading-[33px] tracking-[-0.44px] text-[#151515]/70 md:text-[18px] md:leading-7">
            Debate hours are live, drop-in rooms on topics you care about. Listen first, then pair up with someone who
            sees it differently.
          </p>
          {hours && hours.rest.length > 0 ? (
            <div className="flex flex-wrap items-center gap-5">
              <a
                href="#debate-hours-list"
                className={cx(PILL_CLASS_NAME, SOLID_PILL_CLASS_NAME)}
                data-geo-analytics-label="Debate hours Find a debate hour"
                data-geo-analytics-intent="debate_hours_action"
              >
                Find a debate hour
              </a>
              <span className="text-[18px] leading-7 text-[#151515]/60">
                {upcomingCount} this week
                {hours.goingTotal > 0
                  ? ` · ${hours.goingTotal} ${hours.goingTotal === 1 ? 'person' : 'people'} going`
                  : ''}
              </span>
            </div>
          ) : null}
        </div>

        {lobbies.isError && !lobbies.data ? (
          <LoadFailed onRetry={() => void lobbies.refetch()} />
        ) : !hours ? (
          <div aria-hidden className="h-[360px] animate-pulse rounded-[20px] bg-[#f2f2f2]" />
        ) : hours.featured ? (
          <FeaturedDebateHour lobby={hours.featured} now={now} />
        ) : (
          <NoDebateHours />
        )}
      </section>

      {hours && hours.rest.length > 0 ? (
        <section
          id="debate-hours-list"
          aria-labelledby="debate-hours-list-title"
          className="mx-auto flex max-w-[1200px] scroll-mt-16 flex-col gap-7 px-10 pb-20 md:px-6 md:pb-12"
        >
          <h2
            id="debate-hours-list-title"
            className="text-[40px] leading-[44px] font-semibold tracking-[-1.6px] md:text-[28px] md:leading-8 md:tracking-[-1px]"
          >
            <span className="text-[#151515]/60">Pick a time</span> that works for you.
          </h2>
          <ul className="grid grid-cols-2 gap-5 md:grid-cols-1 md:gap-3">
            {hours.rest.map((lobby, index) => (
              <DebateHourCard key={lobby.lobby_id} lobby={lobby} tile={TILE_COLORS[index % TILE_COLORS.length]!} />
            ))}
          </ul>
        </section>
      ) : null}

      <HowItWorks />
    </div>
  );
}

/**
 * The marketing site's `PillButton`: one 44px size, its type stepping down from 20 to 18 below
 * 1730, solid ink or a 2px ink outline that takes a second, inset pixel on hover.
 */
const PILL_CLASS_NAME =
  'inline-flex h-11 items-center justify-center rounded-full px-5 text-[20px] leading-none font-medium tracking-[-0.8px] whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:opacity-60 max-[1730px]:text-[18px]';
const SOLID_PILL_CLASS_NAME = 'bg-[#151515] text-white hover:bg-[#0e0e0e]';
const OUTLINE_PILL_CLASS_NAME =
  'border-2 border-[#151515] bg-white text-[#151515] hover:border-[#0e0e0e] hover:shadow-[inset_0_0_0_1px_#0e0e0e]';

/** The marketing palette's light fills, in order down the list. Ink reads on every one of them. */
const TILE_COLORS = ['#ffd400', '#43d384', '#fe90e1', '#ff7900'] as const;

/**
 * Says "You're going" once a lobby on the page turns to Going, however it got there: a press here,
 * or the RSVP queued before sign-up landing after it. A list read for a different account (signing
 * in swaps it) is taken as the new starting point, so lobbies the viewer was already going to say
 * nothing.
 */
function useGoingToast(lobbies: DebateLobbySummary[] | undefined) {
  const { accountKey } = useGeoChatAuth();
  const setToast = useSetToast();
  const seen = React.useRef<{ account: string | null; going: Map<string, boolean> } | null>(null);

  React.useEffect(() => {
    if (!lobbies) return;
    const previous = seen.current;
    seen.current = {
      account: accountKey,
      going: new Map(lobbies.map(lobby => [dashlessId(lobby.lobby_id), lobby.viewer_reminded])),
    };
    if (!previous || previous.account !== accountKey) return;
    const newlyGoing = lobbies.find(
      lobby => lobby.viewer_reminded && previous.going.get(dashlessId(lobby.lobby_id)) === false
    );
    if (newlyGoing) {
      setToast(<span>You’re going to {newlyGoing.name}. We’ve emailed you a calendar invite.</span>);
    }
  }, [accountKey, lobbies, setToast]);
}

/** The hosts' faces, overlapping. Public: a host lists the lobby. */
function HostFaces({ lobby, size, ring }: { lobby: DebateLobbySummary; size: number; ring: string }) {
  const hosts = lobby.hosts.slice(0, 3);
  if (hosts.length === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0">
      {hosts.map((host, index) => (
        <span
          key={host.user_id}
          className={cx('overflow-hidden rounded-full border-2', ring, index > 0 && '-ml-2')}
          style={{ width: size, height: size }}
        >
          <Avatar avatarUrl={host.avatar_cid} value={host.profile_space_id} alt={personName(host)} size={size - 4} />
        </span>
      ))}
    </span>
  );
}

/**
 * RSVP and Going in the marketing site's pill. A new account made from here is asked only for a
 * name, so the visitor is back on this page one step after signing up.
 */
function DebateHourRsvp({ lobby, onColor = false }: { lobby: DebateLobbySummary; onColor?: boolean }) {
  const remind = useLobbyReminderPress(lobby, { nameOnlyOnboarding: true });
  const going = remind.reminded;
  return (
    <div className={cx('flex flex-col gap-1', onColor ? 'items-stretch' : 'items-end')}>
      <button
        type="button"
        aria-pressed={going}
        disabled={remind.pending}
        onClick={remind.press}
        data-geo-analytics-label={`Debate hours ${going ? 'Going' : 'RSVP'}`}
        data-geo-analytics-intent="debate_hours_rsvp"
        className={cx(
          PILL_CLASS_NAME,
          onColor && 'w-full',
          // On the coloured card RSVP is the solid pill; in the list it is the outline one.
          going === onColor ? OUTLINE_PILL_CLASS_NAME : SOLID_PILL_CLASS_NAME
        )}
      >
        {rsvpLabel(going)}
      </button>
      <LobbyReminderError error={remind.error} className={onColor ? 'text-center' : 'text-right'} />
    </div>
  );
}

/** Join, for a debate hour that is open now: into the lobby, in the solid pill. */
function JoinDebateHour({ lobby, className }: { lobby: DebateLobbySummary; className?: string }) {
  return (
    <Link
      href={debateRoomPath(lobby.lobby_id)}
      onClick={() => markLobbyEntry(lobby.lobby_id, 'debate_hours')}
      data-geo-analytics-label="Debate hours Join lobby"
      data-geo-analytics-intent="debate_hours_action"
      className={cx(PILL_CLASS_NAME, SOLID_PILL_CLASS_NAME, className)}
    >
      Join
    </Link>
  );
}

/** When the featured card says "Starting soon": a newcomer deciding whether to wait for this one wants to know an hour out. */
const STARTING_SOON_MS = 60 * 60_000;

/** The next debate hour, or one happening now, as the page's one big thing to do. */
function FeaturedDebateHour({ lobby, now }: { lobby: DebateLobbySummary; now: number }) {
  const live = lobby.open;
  const startsSoon = !live && Date.parse(lobby.starts_at) - now < STARTING_SOON_MS;
  return (
    <article
      aria-labelledby="featured-debate-hour"
      className="md:rounded-2xl flex flex-col gap-5 rounded-[20px] bg-[#46c8ff] p-7 md:gap-4 md:p-5"
      data-testid="featured-debate-hour"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-[34px] bg-white/70 px-3 py-1.5 text-[14px] leading-4 font-medium tracking-[-0.28px]">
          {live ? 'Happening now' : startsSoon ? 'Starting soon' : 'Coming up next'}
        </span>
        <span className="text-[16px] leading-5 font-medium tracking-[-0.32px]">
          {live ? `${lobby.headcount} here` : lobbyWhenLabel(lobby.starts_at, ' · ')}
        </span>
      </div>
      <h2
        id="featured-debate-hour"
        className="text-[34px] leading-[37px] font-semibold tracking-[-1.2px] md:text-[26px] md:leading-[29px] md:tracking-[-0.9px]"
      >
        <Link
          href={debateRoomPath(lobby.lobby_id)}
          onClick={() => markLobbyEntry(lobby.lobby_id, 'debate_hours')}
          className="hover:underline"
        >
          {lobby.name}
        </Link>
      </h2>
      <div className="flex items-center gap-2.5 text-[17px] leading-[22px] text-[#151515]/75 md:text-[15px] md:leading-5">
        <HostFaces lobby={lobby} size={32} ring="border-[#46c8ff]" />
        <span className="min-w-0">
          <LobbyByline lobby={lobby} hostedBy analyticsLabel="Debate hours host" />
        </span>
      </div>
      {live ? <JoinDebateHour lobby={lobby} className="w-full" /> : <DebateHourRsvp lobby={lobby} onColor />}
      <span className="text-center text-[15px] leading-5 text-[#151515]/70">
        {live ? 'Free to join · listen in or pair up' : 'Free to join · we’ll send a calendar invite'}
      </span>
    </article>
  );
}

/**
 * One more debate hour this week: the day and time on a coloured tile, the name, the hosts, RSVP. One
 * already open (a second live lobby; the busiest is featured) says who is there and offers Join.
 */
function DebateHourCard({ lobby, tile }: { lobby: DebateLobbySummary; tile: string }) {
  const status = lobby.open
    ? `${lobby.headcount} here`
    : lobby.reminder_count > 0
      ? goingLabel(lobby.reminder_count)
      : 'Be the first to RSVP';
  return (
    <li
      className="flex flex-col gap-4 rounded-xl border border-[#e2e2e2] bg-white p-5 md:p-4"
      data-testid="debate-hour-card"
    >
      <div className="flex items-center gap-[18px] md:gap-3">
        <span
          aria-hidden
          // At least square, wider for "Tomorrow", as the app's own date badge does.
          className="flex h-[72px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 md:h-14 md:min-w-14 md:px-1.5"
          style={{ backgroundColor: tile }}
        >
          <span className="text-[13px] leading-[15px] font-medium text-[#151515]/75">
            {lobbyDayLabel(lobby.starts_at)}
          </span>
          <span className="text-[22px] leading-6 font-semibold tracking-[-0.6px] whitespace-nowrap md:text-[17px] md:leading-5">
            {lobbyBadgeTime(lobby.starts_at)}
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Link
            href={debateRoomPath(lobby.lobby_id)}
            onClick={() => markLobbyEntry(lobby.lobby_id, 'debate_hours')}
            className="text-[21px] leading-[25px] font-semibold tracking-[-0.63px] hover:underline md:text-[17px] md:leading-[21px] md:tracking-[-0.4px]"
          >
            <span className="sr-only">{lobbyWhenLabel(lobby.starts_at, ' · ')}: </span>
            {lobby.name}
          </Link>
          <span className="flex min-w-0 items-center gap-2 text-[16px] leading-5 text-[#151515]/60 md:text-[14px] md:leading-[18px]">
            <HostFaces lobby={lobby} size={26} ring="border-white" />
            <span className="min-w-0 truncate">
              {lobby.hosts.length > 0 ? (
                <>
                  Hosted by <LobbyHostNames hosts={lobby.hosts} analyticsLabel="Debate hours host" />
                </>
              ) : null}
            </span>
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#efefef] pt-4">
        <span className="text-[16px] leading-5 text-[#151515]/60">{status}</span>
        {lobby.open ? <JoinDebateHour lobby={lobby} /> : <DebateHourRsvp lobby={lobby} />}
      </div>
    </li>
  );
}

/** Nothing scheduled this week: say so, and send them somewhere with something to watch. */
function NoDebateHours() {
  return (
    <div
      className="flex flex-col gap-4 rounded-[20px] border border-[#e2e2e2] p-7 md:p-5"
      data-testid="no-debate-hours"
    >
      <h2 className="text-[28px] leading-8 font-semibold tracking-[-0.8px]">No debate hours this week yet</h2>
      <p className="text-[18px] leading-7 text-[#151515]/70">
        New ones are added often. In the meantime, watch recent debates and vote on who made the better case.
      </p>
      <Link
        href={NavUtils.toExplore()}
        data-geo-analytics-label="Debate hours Watch debates"
        data-geo-analytics-intent="debate_hours_action"
        className={cx(PILL_CLASS_NAME, SOLID_PILL_CLASS_NAME, 'self-start')}
      >
        Watch debates
      </Link>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-[#e2e2e2] p-7 md:p-5">
      <p className="text-[18px] leading-7">We couldn’t load debate hours.</p>
      <button type="button" onClick={onRetry} className={cx(PILL_CLASS_NAME, OUTLINE_PILL_CLASS_NAME, 'self-start')}>
        Try again
      </button>
    </div>
  );
}

const STEPS = [
  { color: '#fe90e1', title: 'RSVP', body: 'Choose a debate hour. We’ll send a calendar invite with the link.' },
  {
    color: '#ffd400',
    title: 'Listen in',
    body: 'The room opens ten minutes early. Hear a few debates and get a feel for it.',
  },
  {
    color: '#43d384',
    title: 'Make your case',
    body: 'When you’re ready, pair up with someone who disagrees and talk it through.',
  },
] as const;

function HowItWorks() {
  return (
    <section
      aria-labelledby="debate-hours-how"
      className="border-t border-[#e2e2e2] px-10 pt-[72px] pb-20 md:px-6 md:pt-12 md:pb-14"
    >
      <div className="mx-auto flex max-w-[1120px] flex-col gap-10 md:gap-7">
        <h2
          id="debate-hours-how"
          className="text-[40px] leading-[44px] font-semibold tracking-[-1.6px] md:text-[28px] md:leading-8 md:tracking-[-1px]"
        >
          <span className="text-[#151515]/60">New to debating?</span> Here’s what to expect.
        </h2>
        <ol className="grid grid-cols-3 gap-10 md:grid-cols-1 md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-full text-[20px] font-semibold"
                style={{ backgroundColor: step.color }}
              >
                {index + 1}
              </span>
              <span className="text-[24px] leading-7 font-semibold tracking-[-0.72px]">{step.title}</span>
              <span className="text-[18px] leading-7 text-[#151515]/70">{step.body}</span>
            </li>
          ))}
        </ol>
        <p className="text-[18px] leading-7">
          Met someone you’d like to keep debating? You can schedule a one-on-one with them afterwards.
        </p>
      </div>
    </section>
  );
}

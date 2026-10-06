'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';

import { Avatar } from '~/design-system/avatar';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type { DebatePerson } from '../api';
import { speakerLabel } from '../playback-utils';
import { calendarHourOpened, calendarPersonViewed } from './debate-calendar-analytics';
import {
  type CellPerson,
  DAYS_IN_WEEK,
  type FreeSlot,
  HOURS_IN_DAY,
  type OwnDebate,
  cellKey,
  cellOf,
  firstBusyHour,
  hourLabel,
  hourStart,
  timeRangeLabel,
  weekOffsetLabels,
} from './debate-calendar-model';
import { debateActionAnalyticsAttributes } from './hub-analytics';
import { HUB_ICON_BUTTON_CLASS_NAME } from './hub-pill-button';
import { useDebatesHub } from './use-debates-hub';

/** Faces drawn in a cell before the rest collapse into "+N". */
const FACES_PER_CELL = 3;

/** How long a face's card waits before opening on hover, and before closing once the pointer leaves. */
const CARD_OPEN_DELAY_MS = 250;
const CARD_CLOSE_DELAY_MS = 200;

const GRID_COLUMNS = 'grid-cols-[4rem_repeat(7,minmax(0,1fr))]';

type RenderRow = (userKey: string, slots: FreeSlot[], entry: ScheduleEntry) => React.ReactNode;

type Props = {
  /** Eight local midnights: the week's seven days and the one that closes it. */
  days: Date[];
  cells: ReadonlyMap<string, CellPerson[]>;
  debates: OwnDebate[];
  /** The cells the viewer is free in (`viewerFreeCellKeys`), or null with no schedule to shade. */
  viewerFreeCells: ReadonlySet<string> | null;
  peopleByUser: ReadonlyMap<string, DebatePerson>;
  slotsByUser: ReadonlyMap<string, FreeSlot[]>;
  opponentName: (userId: string | null) => string | null;
  renderRow: RenderRow;
  onBook: (userKey: string, opener: HTMLElement | null, entry: ScheduleEntry, initialStart?: string) => void;
  now: number;
};

type Card = { key: string; userKey: string; slots: FreeSlot[] };

/**
 * The week as a grid (GEO-3152): a column per day, a row per hour, and in each cell the faces of
 * everyone free for some of that hour, most matches first.
 *
 * - A face opens that person's row as a card on hover (or tap); clicking it books their first
 *   half-hour in that cell, through the same modal as the People tab, with the time picked.
 * - The cell itself opens everyone free then. It is also how the keyboard gets in: arrows move
 *   between hours, Enter opens the one in focus.
 * - The viewer's own debates are blocks in their hour: solid booked, dashed requested.
 */
export function CalendarWeek({
  days,
  cells,
  debates,
  viewerFreeCells,
  peopleByUser,
  slotsByUser,
  opponentName,
  renderRow,
  onBook,
  now,
}: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const cellRefs = React.useRef(new Map<string, HTMLDivElement>());

  const debatesByCell = React.useMemo(() => {
    const byCell = new Map<string, OwnDebate[]>();
    for (const debate of debates) {
      const cell = cellOf(debate.start, days);
      if (!cell) continue;
      const key = cellKey(cell.day, cell.hour);
      byCell.set(key, [...(byCell.get(key) ?? []), debate]);
    }
    return byCell;
  }, [days, debates]);

  // Opens at the first busy hour: all 24 are there, but most of a week is the middle of the night.
  // Once per week shown, so new data landing does not yank the grid away from where it was read.
  const firstBusy = firstBusyHour(cells, debates, days);
  const weekKey = days[0].getTime();
  const scrolledFor = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    if (scrolledFor.current === weekKey) return;
    const container = scrollRef.current;
    const row = rowRefs.current[firstBusy ?? new Date(now).getHours()];
    if (!container || !row) return;
    scrolledFor.current = weekKey;
    container.scrollTop = Math.max(0, row.offsetTop - container.offsetTop - 8);
  }, [firstBusy, now, weekKey]);

  const [focused, setFocused] = React.useState(() => ({ day: 0, hour: firstBusy ?? 9 }));
  const [openHour, setOpenHour] = React.useState<string | null>(null);

  const [card, setCard] = React.useState<Card | null>(null);
  // Which card is showing, read when the next one opens. A ref rather than the state updater:
  // updaters can run twice, and the analytics call in here must not.
  const shownCard = React.useRef<Card | null>(null);
  shownCard.current = card;
  const cardAnchor = React.useRef<HTMLElement | null>(null);
  const cardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCardTimer = () => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = null;
  };
  React.useEffect(() => clearCardTimer, []);
  const showCard = (next: Card, anchor: HTMLElement, delay: number) => {
    clearCardTimer();
    const show = () => {
      cardAnchor.current = anchor;
      const shown = shownCard.current;
      const person = peopleByUser.get(next.userKey);
      if (person && (shown?.key !== next.key || shown.userKey !== next.userKey)) calendarPersonViewed(person.user_id);
      setCard(next);
    };
    if (delay === 0) show();
    else cardTimer.current = setTimeout(show, delay);
  };
  const hideCard = () => {
    clearCardTimer();
    cardTimer.current = setTimeout(() => setCard(null), CARD_CLOSE_DELAY_MS);
  };

  const openHourAt = (key: string) => {
    const people = cells.get(key) ?? [];
    if (people.length === 0) return;
    clearCardTimer();
    setCard(null);
    setOpenHour(key);
    calendarHourOpened(people.length);
  };

  const focusCell = (day: number, hour: number) => {
    const next = {
      day: Math.max(0, Math.min(DAYS_IN_WEEK - 1, day)),
      hour: Math.max(0, Math.min(HOURS_IN_DAY - 1, hour)),
    };
    setFocused(next);
    cellRefs.current.get(cellKey(next.day, next.hour))?.focus();
  };
  const onCellKeyDown = (event: React.KeyboardEvent, day: number, hour: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusCell(day + move[0], hour + move[1]);
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
      event.preventDefault();
      openHourAt(cellKey(day, hour));
    }
  };

  const todayIndex = cellOf(now, days)?.day ?? -1;
  const offsets = weekOffsetLabels(days);

  return (
    <div className="overflow-x-auto rounded-lg border border-grey-02">
      <div
        role="grid"
        aria-label="Who is free each hour this week"
        aria-rowcount={HOURS_IN_DAY + 1}
        className="min-w-[900px]"
      >
        <div role="row" className={cx('grid border-b border-grey-02 bg-white', GRID_COLUMNS)}>
          {/* The zone's offset, bottom of the time column's head, as Google Calendar has it. */}
          <div
            role="columnheader"
            aria-label={`Time, ${offsets.join(' then ')}`}
            className="flex flex-col justify-end border-r border-grey-01 px-2 pb-1.5 text-[11px] leading-tight whitespace-nowrap text-grey-04 tabular-nums"
          >
            {offsets.map(label => (
              <span key={label} aria-hidden>
                {label}
              </span>
            ))}
          </div>
          {days.slice(0, DAYS_IN_WEEK).map((date, day) => (
            <div
              key={date.getTime()}
              role="columnheader"
              className="flex flex-col items-center border-r border-grey-01 px-2 py-2 last:border-r-0"
            >
              <Text as="span" variant="metadataMedium" color="grey-04">
                {date.toLocaleDateString(undefined, { weekday: 'short' })}
              </Text>
              <Text
                as="span"
                variant="smallTitle"
                className={cx(day === todayIndex && 'rounded-full bg-text px-2 text-white')}
              >
                {date.getDate()}
              </Text>
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="max-h-[max(24rem,calc(100vh-22rem))] overflow-y-auto" role="rowgroup">
          {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
            <div
              key={hour}
              ref={element => {
                rowRefs.current[hour] = element;
              }}
              role="row"
              className={cx('grid border-b border-grey-01 last:border-b-0', GRID_COLUMNS)}
            >
              <div role="rowheader" className="border-r border-grey-01 px-2 py-1.5 text-footnote text-grey-04">
                {hourLabel(hour)}
              </div>
              {days.slice(0, DAYS_IN_WEEK).map((date, day) => {
                const key = cellKey(day, hour);
                const people = cells.get(key) ?? [];
                const own = debatesByCell.get(key) ?? [];
                const start = hourStart(days, day, hour);
                const shaded = viewerFreeCells?.has(key) ?? false;
                const past = start + 60 * 60_000 <= now;
                return (
                  <Popover.Root key={key} open={openHour === key} onOpenChange={open => setOpenHour(open ? key : null)}>
                    <Popover.Anchor asChild>
                      <div
                        ref={element => {
                          if (element) cellRefs.current.set(key, element);
                          else cellRefs.current.delete(key);
                        }}
                        role="gridcell"
                        tabIndex={focused.day === day && focused.hour === hour ? 0 : -1}
                        aria-label={cellLabel(date, hour, people, peopleByUser, shaded)}
                        aria-haspopup={people.length > 0 ? 'dialog' : undefined}
                        onFocus={() => setFocused({ day, hour })}
                        onKeyDown={event => onCellKeyDown(event, day, hour)}
                        // Anywhere in the cell opens the hour. A face books instead and a block of
                        // the viewer's own opens Requests; both stop the click on their way out.
                        onClick={() => openHourAt(key)}
                        className={cx(
                          'flex min-h-16 min-w-0 flex-col justify-center gap-1 border-r border-grey-01 px-2 py-1.5 outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-ctaPrimary focus-visible:ring-inset',
                          shaded ? 'bg-green/10' : past ? 'bg-grey-01/50' : 'bg-white',
                          people.length > 0 && 'cursor-pointer hover:bg-grey-01',
                          openHour === key && 'ring-1 ring-text ring-inset'
                        )}
                      >
                        {own.map(debate => (
                          <DebateBlock key={debate.requestId} debate={debate} opponentName={opponentName} />
                        ))}
                        {people.length > 0 ? (
                          <div className="flex items-center">
                            {people.slice(0, FACES_PER_CELL).map(({ userKey, slots }) => {
                              const person = peopleByUser.get(userKey);
                              if (!person) return null;
                              return (
                                <Face
                                  key={userKey}
                                  person={person}
                                  onHover={anchor => showCard({ key, userKey, slots }, anchor, CARD_OPEN_DELAY_MS)}
                                  onLeave={hideCard}
                                  onTap={anchor => showCard({ key, userKey, slots }, anchor, 0)}
                                  onBook={anchor => {
                                    clearCardTimer();
                                    setCard(null);
                                    onBook(userKey, anchor, 'calendar_slot', new Date(slots[0].start).toISOString());
                                  }}
                                />
                              );
                            })}
                            {people.length > FACES_PER_CELL ? (
                              <button
                                type="button"
                                tabIndex={-1}
                                aria-label={`Everyone free then: ${people.length} people`}
                                {...debateActionAnalyticsAttributes('calendar', 'More people', 'open_calendar_hour')}
                                onClick={event => {
                                  // Like a face or a debate block: the cell around it opens the hour too, and once is enough.
                                  event.stopPropagation();
                                  openHourAt(key);
                                }}
                                className="-ml-2 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-grey-02 text-footnoteMedium text-grey-04 ring-2 ring-white"
                              >
                                +{people.length - FACES_PER_CELL}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </Popover.Anchor>
                    {openHour === key ? (
                      <Popover.Portal>
                        <Popover.Content
                          side="right"
                          align="start"
                          sideOffset={8}
                          collisionPadding={16}
                          aria-label={`Free ${date.toLocaleDateString(undefined, { weekday: 'long' })} at ${hourLabel(hour)}`}
                          className="z-100 flex max-h-[min(36rem,calc(100vh-6rem))] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-grey-02 bg-white shadow-lg"
                        >
                          <HourPeople
                            date={date}
                            hour={hour}
                            people={people}
                            renderRow={renderRow}
                            onClose={() => setOpenHour(null)}
                          />
                        </Popover.Content>
                      </Popover.Portal>
                    ) : null}
                  </Popover.Root>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Popover.Root
        open={card !== null}
        onOpenChange={open => {
          if (!open) setCard(null);
        }}
      >
        <Popover.Anchor virtualRef={cardAnchor as React.RefObject<HTMLElement>} />
        {card ? (
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={16}
              // A hover card: reading it should not take focus from where the viewer was.
              onOpenAutoFocus={event => event.preventDefault()}
              onPointerEnter={clearCardTimer}
              onPointerLeave={hideCard}
              aria-label={peopleByUser.get(card.userKey) ? speakerLabel(peopleByUser.get(card.userKey)!) : 'Person'}
              className="z-100 w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-grey-02 bg-white px-3 shadow-lg"
            >
              <ul>
                {renderRow(
                  card.userKey,
                  card.slots.length > 0 ? card.slots : (slotsByUser.get(card.userKey) ?? []),
                  'calendar_card'
                )}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </div>
  );
}

function cellLabel(
  date: Date,
  hour: number,
  people: CellPerson[],
  peopleByUser: ReadonlyMap<string, DebatePerson>,
  viewerFree: boolean
) {
  const when = `${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${hourLabel(hour)}`;
  const mine = viewerFree ? ", you're free" : '';
  if (people.length === 0) return `${when}, nobody free${mine}`;
  const names = people
    .slice(0, FACES_PER_CELL)
    .map(({ userKey }) => {
      const person = peopleByUser.get(userKey);
      return person ? speakerLabel(person) : null;
    })
    .filter(Boolean)
    .join(', ');
  const rest = people.length > FACES_PER_CELL ? ` and ${people.length - FACES_PER_CELL} more` : '';
  return `${when}, free: ${names}${rest}${mine}`;
}

/**
 * One face in a cell. A mouse hover opens the card and a click books; a touch has no hover, so a
 * tap opens the card instead, and the card's own chips and buttons book.
 */
function Face({
  person,
  onHover,
  onLeave,
  onTap,
  onBook,
}: {
  person: DebatePerson;
  onHover: (anchor: HTMLElement) => void;
  onLeave: () => void;
  onTap: (anchor: HTMLElement) => void;
  onBook: (anchor: HTMLElement) => void;
}) {
  const pointerType = React.useRef<string>('mouse');
  const name = speakerLabel(person);
  const away = Boolean(person.away);
  const live = person.online && !away && !person.in_debate;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`${name}${live ? ', online now' : away ? ', away' : person.in_debate ? ', in a debate' : ''}. Book a time`}
      {...debateActionAnalyticsAttributes('calendar', 'Face', 'open_peer_availability')}
      onPointerDown={event => {
        pointerType.current = event.pointerType;
      }}
      onPointerEnter={event => {
        if (event.pointerType === 'mouse') onHover(event.currentTarget);
      }}
      onPointerLeave={event => {
        if (event.pointerType === 'mouse') onLeave();
      }}
      onFocus={event => onHover(event.currentTarget)}
      onBlur={onLeave}
      onClick={event => {
        event.stopPropagation();
        if (pointerType.current === 'touch') onTap(event.currentTarget);
        else onBook(event.currentTarget);
      }}
      className={cx(
        'relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-full ring-2 ring-white not-first:-ml-2',
        live && 'outline-2 outline-offset-2 outline-green',
        away && 'opacity-45'
      )}
    >
      <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={30} />
    </button>
  );
}

/** Everyone free in one hour, as People tab rows, most matches first. */
function HourPeople({
  date,
  hour,
  people,
  renderRow,
  onClose,
}: {
  date: Date;
  hour: number;
  people: CellPerson[];
  renderRow: RenderRow;
  onClose: () => void;
}) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour).getTime();
  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-grey-02 px-4 pt-3 pb-2">
        <div className="flex flex-col gap-0.5">
          <Text as="p" variant="listSemibold">
            {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
            {timeRangeLabel(start, start + 60 * 60_000)}
          </Text>
          <Text as="p" variant="footnote" color="grey-04">
            {people.length} {people.length === 1 ? 'person' : 'people'} free · most matches first
          </Text>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className={HUB_ICON_BUTTON_CLASS_NAME}>
          <CloseSmall />
        </button>
      </div>
      <ul className="min-h-0 overflow-y-auto px-4">
        {people.map(({ userKey, slots }) => (
          <React.Fragment key={userKey}>{renderRow(userKey, slots, 'calendar_hour')}</React.Fragment>
        ))}
      </ul>
    </>
  );
}

/** One of the viewer's own debates: solid once booked, dashed while it waits for an answer. */
function DebateBlock({
  debate,
  opponentName,
}: {
  debate: OwnDebate;
  opponentName: (userId: string | null) => string | null;
}) {
  const { open } = useDebatesHub();
  const name = opponentName(debate.opponentUserId);
  const label =
    debate.state === 'booked'
      ? `Booked${name ? ` · Debate with ${name}` : ''}`
      : debate.state === 'asked'
        ? `Asked${name ? ` · ${name}` : ''}`
        : `Requested${name ? ` · ${name}` : ''}`;
  return (
    <button
      type="button"
      // The Requests tab is where a scheduled debate is answered, moved, cancelled or joined.
      {...debateActionAnalyticsAttributes('calendar', 'Own debate', 'open_debate_requests')}
      onClick={event => {
        event.stopPropagation();
        open('requests');
      }}
      className={cx(
        'flex w-full min-w-0 flex-col rounded-md px-2 py-1 text-left text-footnoteMedium',
        debate.state === 'booked' ? 'bg-text text-white' : 'border border-dashed border-text bg-white text-text'
      )}
    >
      <span>{timeRangeLabel(debate.start, debate.end)}</span>
      <span className={cx('truncate font-normal', debate.state === 'booked' ? 'text-grey-02' : 'text-grey-04')}>
        {label}
      </span>
    </button>
  );
}

/** The grid's frame with faces still to come: filters and the week stay put while it loads. */
export function CalendarWeekSkeleton() {
  const filled = new Set(['1:2', '2:1', '2:4', '3:0', '3:3', '3:5', '4:2', '4:6']);
  return (
    <div aria-busy="true" aria-label="Loading who is free" className="overflow-hidden rounded-lg border border-grey-02">
      {Array.from({ length: 6 }, (_, row) => (
        <div key={row} className={cx('grid border-b border-grey-01 last:border-b-0', GRID_COLUMNS)}>
          <div className="border-r border-grey-01 px-2 py-2">
            <Skeleton className="h-3 w-8" />
          </div>
          {Array.from({ length: DAYS_IN_WEEK }, (_, day) => (
            <div key={day} className="flex min-h-16 items-center border-r border-grey-01 px-2 last:border-r-0">
              {filled.has(`${row}:${day}`) ? <Skeleton radius="rounded-full" className="h-[30px] w-[30px]" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

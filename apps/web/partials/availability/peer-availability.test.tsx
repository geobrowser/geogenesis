import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PeerSchedule, PeerSlot } from '~/core/availability/peer-schedule';

import {
  MUTUAL_SLOT,
  PEER_ONLY_SLOT,
  type PeerAvailabilityBooking,
  PeerAvailabilityView,
  SELECTED_SLOT,
} from './peer-availability';

// A fixed clock, so the seven columns and their labels are the same on every run. A Monday.
const NOW = new Date('2026-09-21T15:00:00Z');

/** Chips are labelled in the viewer's zone; UTC on both sides keeps the fixtures readable. */
const slot = (hour: number, viewerIsFree = true, day = 21): PeerSlot => ({
  start: `2026-09-${day}T${String(hour).padStart(2, '0')}:00:00Z`,
  end: `2026-09-${day}T${String(hour).padStart(2, '0')}:30:00Z`,
  viewerIsFree,
});

const schedule = (overrides: Partial<PeerSchedule> = {}): PeerSchedule => ({
  userId: 'user-peer',
  viewerTimezone: 'UTC',
  peerTimezone: 'UTC',
  viewerHasSchedule: true,
  peerHasSchedule: true,
  theirWeekKnown: true,
  slots: [slot(13)],
  ...overrides,
});

const setup = (overrides: Partial<PeerSchedule> = {}, peerName: string | null = 'Ada') => ({
  user: userEvent.setup(),
  ...render(<PeerAvailabilityView schedule={schedule(overrides)} peerName={peerName} now={NOW} />),
});

const booking = (overrides: Partial<PeerAvailabilityBooking> = {}): PeerAvailabilityBooking => ({
  onRequest: vi.fn(),
  pending: false,
  error: null,
  requestedStart: null,
  ...overrides,
});

const setupBooking = (book: PeerAvailabilityBooking, overrides: Partial<PeerSchedule> = {}) => ({
  user: userEvent.setup(),
  ...render(<PeerAvailabilityView schedule={schedule(overrides)} peerName="Ada" now={NOW} booking={book} />),
});

const day = (date: string) => screen.getByTestId(`peer-day-${date}`);

afterEach(cleanup);

describe('PeerAvailabilityView', () => {
  it('names both people and both zones', () => {
    setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Europe/Berlin' });

    expect(screen.getByRole('heading', { name: 'When Ada is free' })).toBeInTheDocument();
    expect(screen.getByText(/America\/New_York/)).toBeInTheDocument();
    expect(screen.getByText(/Europe\/Berlin/)).toBeInTheDocument();
  });

  // geo-chat leaves a zone empty when that side has no saved schedule, which is exactly the case
  // this view has to draw -- naming it unconditionally rendered "Ada is in ,".
  it('drops the zone line rather than naming an empty zone', () => {
    setup({ peerTimezone: '', peerHasSchedule: false, slots: [] });

    expect(screen.getByText('Times shown in your local time.')).toBeInTheDocument();
    expect(screen.queryByText(/is in ,/)).not.toBeInTheDocument();
  });

  it('falls back to a shortened id when nobody supplied a name', () => {
    setup({}, null);
    expect(screen.getByRole('heading', { name: /user-pee/ })).toBeInTheDocument();
  });

  it('shows the unknown-week state on a deployment that cannot send it', () => {
    setup({ theirWeekKnown: false, slots: [] });
    expect(screen.getByText(/Can’t show Ada’s week from this server yet/)).toBeInTheDocument();
  });

  it('draws seven days', () => {
    setup();
    expect(screen.getAllByTestId(/^peer-day-/)).toHaveLength(7);
    expect(within(day('2026-09-21')).getByText('Today')).toBeInTheDocument();
    expect(within(day('2026-09-22')).getByText('Tue')).toBeInTheDocument();
  });

  describe('solid and dashed', () => {
    it('draws a mutual slot solid', () => {
      setup({ slots: [slot(13, true)] });
      expect(within(day('2026-09-21')).getByRole('button', { name: /1pm/ })).toHaveAttribute('data-viewer-free');
    });

    it('draws a slot only they are free for dashed, and still pickable', async () => {
      const { user } = setup({ slots: [slot(13, false)] });
      const chip = within(day('2026-09-21')).getByRole('button', { name: /1pm/ });

      expect(chip).not.toHaveAttribute('data-viewer-free');
      expect(chip.className).toContain('border-dashed');

      // Selection exists although nothing consumes it yet -- the scheduling slice hangs off this.
      await user.click(chip);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows a viewer with no schedule the whole week, dashed, rather than nothing', () => {
      setup({
        viewerHasSchedule: false,
        slots: [slot(13, false), slot(14, false)],
      });

      const chips = within(day('2026-09-21')).getAllByRole('button');
      expect(chips).toHaveLength(2);
      expect(chips.every(chip => !chip.hasAttribute('data-viewer-free'))).toBe(true);
    });
  });

  // Against the shared constants rather than literal colors, so a palette change keeps these green
  // and a chip drifting from its legend swatch does not.
  describe('slot looks', () => {
    const wears = (element: Element, look: string) => look.split(' ').every(name => element.classList.contains(name));
    const swatch = (label: string) =>
      within(screen.getByRole('list', { name: 'Legend' }))
        .getByText(label)
        .closest('li')!
        .querySelector('[aria-hidden]')!;

    it('draws each chip in the look its legend swatch shows', () => {
      setup({ slots: [slot(13, true), slot(14, false)] });
      const monday = within(day('2026-09-21'));
      const mutual = monday.getByRole('button', { name: /1pm/ });
      const theirs = monday.getByRole('button', { name: /2pm/ });

      expect(wears(mutual, MUTUAL_SLOT) && wears(swatch('You’re both free'), MUTUAL_SLOT)).toBe(true);
      expect(wears(theirs, PEER_ONLY_SLOT) && wears(swatch('Ada is free'), PEER_ONLY_SLOT)).toBe(true);
      expect(wears(mutual, PEER_ONLY_SLOT) || wears(theirs, MUTUAL_SLOT)).toBe(false);
    });

    // Stacked rather than swapped, the unselected fill and border would fight the selected ones.
    it('replaces a picked chip’s look rather than layering over it', async () => {
      const { user } = setup({ slots: [slot(13, true), slot(14, false)] });
      const monday = within(day('2026-09-21'));

      for (const [name, look] of [
        [/1pm/, MUTUAL_SLOT],
        [/2pm/, PEER_ONLY_SLOT],
      ] as const) {
        const chip = monday.getByRole('button', { name });
        await user.click(chip);
        expect(wears(chip, SELECTED_SLOT)).toBe(true);
        expect(wears(chip, look)).toBe(false);
      }
    });

    it('darkens only unpicked chips on hover, and never the static swatches', async () => {
      const { user } = setup({ slots: [slot(13, true), slot(14, false)] });
      const monday = within(day('2026-09-21'));
      const picked = monday.getByRole('button', { name: /1pm/ });
      await user.click(picked);

      expect(picked.className).not.toMatch(/hover:/);
      expect(monday.getByRole('button', { name: /2pm/ }).className).toContain('hover:border-text');
      for (const label of ['You’re both free', 'Ada is free']) expect(swatch(label).className).not.toMatch(/hover:/);
    });
  });

  describe('legend', () => {
    it('keys both slot styles', () => {
      setup({ slots: [slot(13, true), slot(14, false)] });
      const legend = within(screen.getByRole('list', { name: 'Legend' }));

      expect(legend.getByText('You’re both free')).toBeInTheDocument();
      expect(legend.getByText('Ada is free')).toBeInTheDocument();
    });

    it('drops the mutual key for a viewer with no schedule of their own', () => {
      setup({ viewerHasSchedule: false, slots: [slot(13, false)] });
      const legend = within(screen.getByRole('list', { name: 'Legend' }));

      expect(legend.queryByText('You’re both free')).not.toBeInTheDocument();
      expect(legend.getByText('Ada is free')).toBeInTheDocument();
    });

    it('names them by first name only', () => {
      setup({ slots: [slot(13, false)] }, 'Ada Lovelace');
      const legend = within(screen.getByRole('list', { name: 'Legend' }));

      expect(legend.getByText('Ada is free')).toBeInTheDocument();
    });

    it('is not drawn over an empty week', () => {
      setup({ slots: [] });
      expect(screen.queryByRole('list', { name: 'Legend' })).not.toBeInTheDocument();
    });
  });

  describe('what a screen reader gets', () => {
    it('says whose availability a slot is, since the border style cannot', () => {
      setup({ slots: [slot(13, true), slot(14, false)] });
      const monday = within(day('2026-09-21'));

      expect(monday.getByRole('button', { name: /1pm, you are both free/ })).toBeInTheDocument();
      expect(monday.getByRole('button', { name: /2pm, only Ada is free/ })).toBeInTheDocument();
    });

    // Before the viewer's own window opens the server cannot annotate, so neither can the label.
    it('does not say the viewer is busy when it cannot know', () => {
      setup({ slots: [{ ...slot(13), viewerIsFree: null } as never] });
      const monday = within(day('2026-09-21'));

      expect(monday.getByRole('button', { name: /1pm, Ada is free$/ })).toBeInTheDocument();
      expect(monday.queryByRole('button', { name: /only Ada is free/ })).not.toBeInTheDocument();
    });

    // The same hour recurs on every one of the seven days.
    it('qualifies each slot with its day, so names do not collide across the week', () => {
      setup({ slots: [slot(13), slot(13, true, 22)] });

      expect(screen.getByRole('button', { name: /^Today Sep 21 at 1pm/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Tue Sep 22 at 1pm/ })).toBeInTheDocument();
    });

    it('names the day group', () => {
      setup();
      expect(screen.getByRole('group', { name: 'Today Sep 21' })).toBeInTheDocument();
    });

    it('names the time in the viewer zone only, even across a large offset', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Asia/Tokyo', slots: [slot(13)] });
      expect(screen.getByRole('button', { name: /9am, you are both free/ })).toBeInTheDocument();
    });
  });

  describe('per-day cap', () => {
    const many = [slot(12), slot(13), slot(14), slot(15), slot(16), slot(17)];

    it('shows four and offers the rest', () => {
      setup({ slots: many });
      const monday = within(day('2026-09-21'));

      expect(monday.getAllByRole('button', { name: /at \d/ })).toHaveLength(4);
      expect(monday.getByRole('button', { name: /\+2 more times on/ })).toBeInTheDocument();
    });

    it('expands to all of them', async () => {
      const { user } = setup({ slots: many });
      const monday = within(day('2026-09-21'));

      await user.click(monday.getByRole('button', { name: /\+2 more times on/ }));

      expect(monday.getAllByRole('button', { name: /at \d/ })).toHaveLength(6);
      // A toggle, so an expanded day can be put back.
      expect(monday.getByRole('button', { name: /Show less on/ })).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not offer an expander for exactly four', () => {
      setup({ slots: many.slice(0, 4) });
      expect(within(day('2026-09-21')).queryByRole('button', { name: /more times on/ })).not.toBeInTheDocument();
    });
  });

  describe('empty days', () => {
    it('dims a day they have nothing in, rather than hiding it', () => {
      setup({ slots: [slot(13)] });

      expect(day('2026-09-22')).toHaveAttribute('data-empty');
      expect(within(day('2026-09-22')).getByText('Nothing free')).toBeInTheDocument();
      expect(day('2026-09-21')).not.toHaveAttribute('data-empty');
    });
  });

  describe('hint bar', () => {
    it('appears only when the viewer has no availability set', () => {
      setup({ viewerHasSchedule: false });
      expect(screen.getByText(/You can still see Ada’s/)).toBeInTheDocument();
    });

    it('stays out of the way when they have', () => {
      setup({ viewerHasSchedule: true });
      expect(screen.queryByText(/haven’t set your own availability/)).not.toBeInTheDocument();
    });

    // The likeliest first-run state: nobody has set a schedule yet.
    it('stays out of the way when there is no week to annotate', () => {
      setup({ viewerHasSchedule: false, peerHasSchedule: false, slots: [] });

      expect(screen.getByText('Ada hasn’t set any availability yet.')).toBeInTheDocument();
      expect(screen.queryByText(/You can still see Ada’s/)).not.toBeInTheDocument();
    });

    it('stays out of the way when they have a schedule but nothing free', () => {
      setup({ viewerHasSchedule: false, peerHasSchedule: true, slots: [] });

      expect(screen.getByText('Ada has no times free in the next 7 days.')).toBeInTheDocument();
      expect(screen.queryByText(/You can still see Ada’s/)).not.toBeInTheDocument();
    });

    it('never blocks the week', () => {
      setup({ viewerHasSchedule: false, slots: [slot(13, false)] });
      expect(screen.getAllByTestId(/^peer-day-/)).toHaveLength(7);
    });
  });

  describe('whole-person empty state', () => {
    it('says so when they have no availability at all', () => {
      setup({ slots: [], peerHasSchedule: false });

      expect(screen.getByText('Ada hasn’t set any availability yet.')).toBeInTheDocument();
      expect(screen.queryAllByTestId(/^peer-day-/)).toHaveLength(0);
    });

    it('says they have none free rather than none set, when they have a schedule', () => {
      setup({ slots: [], peerHasSchedule: true });

      expect(screen.queryByText(/hasn’t set any availability/)).not.toBeInTheDocument();
      expect(screen.getByText('Ada has no times free in the next 7 days.')).toBeInTheDocument();
    });
  });

  // Europe leaves summer time a week before the US in 2026, so a week spanning Oct 25 holds a
  // +6 offset and a +5 one. Reading one slot's offset as the week's got both of these wrong.
  describe('a week that crosses a DST boundary', () => {
    const OCTOBER = new Date('2026-10-22T15:00:00Z');
    const straddling = (overrides: Partial<PeerSchedule> = {}) =>
      render(
        <PeerAvailabilityView
          schedule={schedule({
            viewerTimezone: 'America/New_York',
            peerTimezone: 'Europe/Berlin',
            slots: [
              { start: '2026-10-23T17:00:00Z', end: '2026-10-23T17:30:00Z', viewerIsFree: true },
              { start: '2026-10-26T17:00:00Z', end: '2026-10-26T17:30:00Z', viewerIsFree: true },
            ],
            ...overrides,
          })}
          peerName="Ada"
          now={OCTOBER}
        />
      );

    it('does not present one offset as the whole week', () => {
      straddling();
      expect(screen.getByText(/Ada is in Europe\/Berlin\.$/)).toBeInTheDocument();
      expect(screen.queryByText(/hrs\./)).not.toBeInTheDocument();
    });

    it('still names the offset when every slot agrees on it', () => {
      straddling({ slots: [{ start: '2026-10-23T17:00:00Z', end: '2026-10-23T17:30:00Z', viewerIsFree: true }] });
      expect(screen.getByText(/Ada is in Europe\/Berlin, \+6 hrs\./)).toBeInTheDocument();
    });
  });

  // A second clock on every chip read as noise, so the viewer's own is the only one shown.
  describe('times on a chip', () => {
    it('shows only the viewer time when the peer is far east', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Asia/Tokyo', slots: [slot(13)] });
      // 13:00Z is 9am in New York and 10pm in Tokyo.
      const chip = screen.getByRole('button', { name: /9am/ });
      expect(chip.textContent).toBe('9am');
      expect(chip.getAttribute('aria-label')).not.toMatch(/10pm/);
    });

    it('shows only the viewer time when the peer is far west', () => {
      // A Tokyo viewer is already on the 22nd at the fixed NOW, so the slot has to be too.
      setup({ viewerTimezone: 'Asia/Tokyo', peerTimezone: 'America/New_York', slots: [slot(13, true, 22)] });
      const chip = screen.getByRole('button', { name: /10pm/ });
      expect(chip.textContent).toBe('10pm');
      expect(chip.getAttribute('aria-label')).not.toMatch(/9am/);
    });
  });

  it('renders no absolute instant anywhere — they are for comparing, not for reading', () => {
    // Named zones rather than the fixture's UTC, which the header prints as a zone name.
    const { container } = setup({
      viewerTimezone: 'America/New_York',
      peerTimezone: 'Europe/Berlin',
      slots: [slot(13), slot(14)],
    });
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}|Z\b|UTC/);
  });
});

describe('booking a slot', () => {
  it('renders no action at all without a booking caller', () => {
    setup({ slots: [slot(13)] });
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('sends the picked slot, and not before one is picked', async () => {
    const book = booking();
    const { user } = setupBooking(book, { slots: [slot(16), slot(17)] });

    const request = screen.getByRole('button', { name: 'Send request' });
    expect(request).toBeDisabled();

    await user.click(within(day('2026-09-21')).getByRole('button', { name: /5pm/ }));
    await user.click(request);

    expect(book.onRequest).toHaveBeenCalledTimes(1);
    // The instant, not its spelling: the view normalizes and would otherwise fail on the `.000`.
    const sent = (book.onRequest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(new Date(sent).getTime()).toBe(new Date('2026-09-21T17:00:00Z').getTime());
  });

  it('keeps one pick at a time, so the request cannot mean two times', async () => {
    const { user } = setupBooking(booking(), { slots: [slot(16), slot(17)] });
    const first = within(day('2026-09-21')).getByRole('button', { name: /4pm/ });
    const second = within(day('2026-09-21')).getByRole('button', { name: /5pm/ });

    await user.click(first);
    await user.click(second);

    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports a refusal rather than looking like nothing happened', () => {
    setupBooking(booking({ error: 'Clashes with a debate at 2pm.' }));
    expect(screen.getByText('Clashes with a debate at 2pm.')).toBeInTheDocument();
  });

  it('says the other person still has to accept', () => {
    setupBooking(booking({ requestedStart: '2026-09-21T14:00:00Z' }));
    expect(screen.getByText(/Ada has to accept/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });
});

describe('what the footer has to say', () => {
  // In the grid's zone rather than the browser's, so the footer cannot contradict the chip.
  it('names the picked time in the viewer zone only', async () => {
    const { user } = setupBooking(booking(), {
      viewerTimezone: 'America/New_York',
      peerTimezone: 'Asia/Tokyo',
      slots: [slot(16)],
    });
    // 16:00Z is noon in New York.
    await user.click(within(day('2026-09-21')).getByRole('button', { name: /12pm/ }));

    expect(
      screen.getByText(new Date('2026-09-21T16:00:00Z').toLocaleString(undefined, { timeZone: 'America/New_York' }))
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ada.s time:/)).not.toBeInTheDocument();
  });

  it('says an outside-your-week slot is a one-off', async () => {
    const { user } = setupBooking(booking(), { slots: [slot(16, false)] });
    await user.click(within(day('2026-09-21')).getByRole('button', { name: /4pm/ }));

    expect(screen.getByText(/doesn.t change your availability/)).toBeInTheDocument();
  });

  it('says nothing of the sort for a slot you are free for', async () => {
    const { user } = setupBooking(booking(), { slots: [slot(16, true)] });
    await user.click(within(day('2026-09-21')).getByRole('button', { name: /4pm/ }));

    expect(screen.queryByText(/doesn.t change your availability/)).not.toBeInTheDocument();
  });
});

describe('a refused invitation', () => {
  const LIMIT =
    'you have 100 invitations to this person waiting for an answer; wait for some to be answered before sending more';

  it('shows the refusal under an outside-your-week slot, and Send stays usable', async () => {
    const { user } = setupBooking(booking({ error: LIMIT }), { slots: [slot(16, false)] });
    await user.click(within(day('2026-09-21')).getByRole('button', { name: /4pm/ }));

    expect(screen.getByText(LIMIT)).toBeInTheDocument();
    expect(screen.getByText(/doesn.t change your availability/)).toBeInTheDocument();
    expect(screen.queryByText(/has to accept/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it('shows the refusal in the free-time footer of an empty week', () => {
    setupBooking(booking({ error: LIMIT }), { peerHasSchedule: false, slots: [] });

    expect(screen.getByText(LIMIT)).toBeInTheDocument();
    expect(screen.queryByText(/has to accept/)).not.toBeInTheDocument();
  });
});

describe('a week with nothing in it', () => {
  it('offers a time anyway rather than walling the viewer off', async () => {
    const book = booking();
    const { user } = setupBooking(book, { peerHasSchedule: false, slots: [] });

    expect(screen.getByText(/hasn.t set any availability yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Time to request'), '2026-09-22T09:00');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(book.onRequest).toHaveBeenCalledTimes(1);
    expect(new Date((book.onRequest as ReturnType<typeof vi.fn>).mock.calls[0][0]).getTime()).toBe(
      new Date('2026-09-22T09:00').getTime()
    );
  });

  it('stays read-only without a booking caller', () => {
    setup({ peerHasSchedule: false, slots: [] });
    expect(screen.queryByLabelText('Time to request')).not.toBeInTheDocument();
  });
});

describe('times that have already gone', () => {
  // The week starts at today's midnight and geo-chat refuses a past start, so a booking caller
  // must not be able to send one.
  it('cannot pick one', async () => {
    const book = booking();
    const { user } = setupBooking(book, { slots: [slot(13), slot(16)] });
    const gone = within(day('2026-09-21')).getByRole('button', { name: /1pm/ });

    expect(gone).toBeDisabled();
    await user.click(gone);

    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(book.onRequest).not.toHaveBeenCalled();
  });

  it('leaves the read-only week pickable, which is what it has always been', async () => {
    const { user } = setup({ slots: [slot(13)] });
    const chip = within(day('2026-09-21')).getByRole('button', { name: /1pm/ });

    expect(chip).not.toBeDisabled();
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  // An open modal does not re-render as time passes, so a time that was ahead when picked can be
  // gone by the click.
  it('refuses a picked time that has gone by the time Send is pressed', async () => {
    // The real clock rather than a pinned `now`: only `Date` is faked, so `userEvent` still runs.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const book = booking();
      const user = userEvent.setup();
      render(<PeerAvailabilityView schedule={schedule({ slots: [slot(16)] })} peerName="Ada" booking={book} />);
      await user.click(within(day('2026-09-21')).getByRole('button', { name: /4pm/ }));

      vi.setSystemTime(new Date('2026-09-21T16:05:00Z'));
      await user.click(screen.getByRole('button', { name: 'Send request' }));

      expect(book.onRequest).not.toHaveBeenCalled();
      expect(screen.getByText(/already passed/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops that notice once another time is picked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const user = userEvent.setup();
      render(
        <PeerAvailabilityView schedule={schedule({ slots: [slot(16), slot(18)] })} peerName="Ada" booking={booking()} />
      );
      await user.click(within(day('2026-09-21')).getByRole('button', { name: /4pm/ }));
      vi.setSystemTime(new Date('2026-09-21T16:05:00Z'));
      await user.click(screen.getByRole('button', { name: 'Send request' }));
      expect(screen.getByText(/already passed/)).toBeInTheDocument();

      await user.click(within(day('2026-09-21')).getByRole('button', { name: /6pm/ }));

      expect(screen.queryByText(/already passed/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('will not send a past time typed into the free-time field', async () => {
    const book = booking();
    const { user } = setupBooking(book, { peerHasSchedule: false, slots: [] });

    await user.type(screen.getByLabelText('Time to request'), '2026-09-20T09:00');

    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(book.onRequest).not.toHaveBeenCalled();
  });
});

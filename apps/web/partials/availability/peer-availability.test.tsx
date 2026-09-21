import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import type { PeerSchedule, PeerSlot } from '~/core/availability/peer-schedule';

import { PeerAvailabilityView } from './peer-availability';

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
  slots: [slot(13)],
  truncated: false,
  ...overrides,
});

const setup = (overrides: Partial<PeerSchedule> = {}, peerName: string | null = 'Ada') => ({
  user: userEvent.setup(),
  ...render(<PeerAvailabilityView schedule={schedule(overrides)} peerName={peerName} now={NOW} />),
});

const day = (date: string) => screen.getByTestId(`peer-day-${date}`);

afterEach(cleanup);

describe('PeerAvailabilityView', () => {
  it('names both people and both zones', () => {
    setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Europe/Berlin' });

    expect(screen.getByRole('heading', { name: 'When you and Ada are both free' })).toBeInTheDocument();
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

  // The first column is the server's window start, which west of UTC can be the viewer's tomorrow.
  it('does not head a shifted first column with Today', () => {
    render(
      <PeerAvailabilityView
        schedule={schedule({ viewerTimezone: 'America/Los_Angeles', slots: [slot(13, true, 22)] })}
        peerName="Ada"
        now={new Date('2026-09-22T01:00:00Z')}
      />
    );

    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tue Sep 22' })).toBeInTheDocument();
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
        peerHasSchedule: null,
        slots: [slot(13, false), slot(14, false)],
      });

      const chips = within(day('2026-09-21')).getAllByRole('button');
      expect(chips).toHaveLength(2);
      expect(chips.every(chip => !chip.hasAttribute('data-viewer-free'))).toBe(true);
    });
  });

  describe('what a screen reader gets', () => {
    it('says whose availability a slot is, since the border style cannot', () => {
      setup({ slots: [slot(13, true), slot(14, false)] });
      const monday = within(day('2026-09-21'));

      expect(monday.getByRole('button', { name: /1pm, you are both free/ })).toBeInTheDocument();
      expect(monday.getByRole('button', { name: /2pm, only Ada is free/ })).toBeInTheDocument();
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

    it('carries their local time into the name when the offset is large', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Asia/Tokyo', slots: [slot(13)] });
      expect(screen.getByRole('button', { name: /9am, 10pm for Ada, you are both free/ })).toBeInTheDocument();
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
      expect(screen.getByText(/Set your availability to see when you and Ada are both free/)).toBeInTheDocument();
    });

    it('stays out of the way when they have', () => {
      setup({ viewerHasSchedule: true });
      expect(screen.queryByText(/Set your availability/)).not.toBeInTheDocument();
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

    it('does not claim they have none when the response could not say', () => {
      setup({ slots: [], peerHasSchedule: null, viewerHasSchedule: false });

      expect(screen.queryByText(/hasn’t set any availability/)).not.toBeInTheDocument();
      expect(screen.getByText('No shared times in the next 7 days.')).toBeInTheDocument();
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

    it('labels each chip from its own offset', () => {
      straddling();
      // Same 17:00Z wall clock for the viewer either side of the boundary; Berlin moves.
      expect(screen.getByRole('button', { name: /1pm.*7pm/s })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /1pm.*6pm/s })).toBeInTheDocument();
    });
  });

  describe('their local time on a chip', () => {
    it('is carried when the offset is large', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Asia/Tokyo', slots: [slot(13)] });
      // 13:00Z is 9am in New York and 10pm in Tokyo.
      expect(screen.getByRole('button', { name: /9am.*10pm/s })).toBeInTheDocument();
    });

    // Only ever tested eastward before, so `Math.abs` could be deleted with every test still green.
    it('is carried when the peer is west of the viewer', () => {
      // A Tokyo viewer is already on the 22nd at the fixed NOW, so the slot has to be too.
      setup({ viewerTimezone: 'Asia/Tokyo', peerTimezone: 'America/New_York', slots: [slot(13, true, 22)] });
      // 13:00Z is 10pm in Tokyo and 9am in New York: an offset of -13 hours.
      expect(screen.getByRole('button', { name: /10pm, 9am for Ada/ })).toBeInTheDocument();
    });

    it('is left off when both are in the same part of the day', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'America/Chicago', slots: [slot(13)] });
      const chip = screen.getByRole('button', { name: /9am/ });
      expect(chip.textContent).toBe('9am');
    });
  });

  it('says when the list was cut short', () => {
    setup({ truncated: true });
    expect(screen.getByText(/Showing the first of your shared times/)).toBeInTheDocument();
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

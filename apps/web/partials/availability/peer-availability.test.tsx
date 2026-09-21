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

  describe('per-day cap', () => {
    const many = [slot(12), slot(13), slot(14), slot(15), slot(16), slot(17)];

    it('shows four and offers the rest', () => {
      setup({ slots: many });
      const monday = within(day('2026-09-21'));

      expect(monday.getAllByRole('button', { name: /[ap]m/ })).toHaveLength(4);
      expect(monday.getByRole('button', { name: '+2 more' })).toBeInTheDocument();
    });

    it('expands to all of them', async () => {
      const { user } = setup({ slots: many });
      const monday = within(day('2026-09-21'));

      await user.click(monday.getByRole('button', { name: '+2 more' }));

      expect(monday.getAllByRole('button', { name: /[ap]m/ })).toHaveLength(6);
      expect(monday.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
    });

    it('does not offer an expander for exactly four', () => {
      setup({ slots: many.slice(0, 4) });
      expect(within(day('2026-09-21')).queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
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
      expect(screen.getByText(/haven’t set your own availability/)).toBeInTheDocument();
    });

    it('stays out of the way when they have', () => {
      setup({ viewerHasSchedule: true });
      expect(screen.queryByText(/haven’t set your own availability/)).not.toBeInTheDocument();
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
      expect(screen.getByText(/No times to show for Ada/)).toBeInTheDocument();
    });
  });

  describe('their local time on a chip', () => {
    it('is carried when the offset is large', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'Asia/Tokyo', slots: [slot(13)] });
      // 13:00Z is 9am in New York and 10pm in Tokyo.
      expect(screen.getByRole('button', { name: /9am.*10pm/s })).toBeInTheDocument();
    });

    it('is left off when both are in the same part of the day', () => {
      setup({ viewerTimezone: 'America/New_York', peerTimezone: 'America/Chicago', slots: [slot(13)] });
      const chip = screen.getByRole('button', { name: /9am/ });
      expect(chip.textContent).toBe('9am');
    });
  });

  it('says when the list was cut short', () => {
    setup({ truncated: true });
    expect(screen.getByText(/Showing the first of Ada’s available times/)).toBeInTheDocument();
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

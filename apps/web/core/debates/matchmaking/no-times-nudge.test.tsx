import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  loaded: true,
  hasTimes: false,
  modal: null as null | {
    openerRef?: { current: HTMLElement | null };
    onSaved?: (blocks: unknown[]) => void;
  },
}));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated }),
  useDebateSchedule: () => ({
    data: mocks.loaded ? { schedule: { timezone: 'UTC' } } : undefined,
    blocks: [],
  }),
}));
vi.mock('~/core/availability/upcoming-availability', () => ({ hasUpcomingAvailability: () => mocks.hasTimes }));
// The editor has its own suite; here it only matters that the line opens it.
vi.mock('~/partials/availability/own-schedule-modal', () => ({
  OwnScheduleModal: (props: {
    open: boolean;
    openerRef?: { current: HTMLElement | null };
    onSaved?: (blocks: unknown[]) => void;
  }) => {
    mocks.modal = props;
    return props.open ? <div role="dialog" aria-label="My times" /> : null;
  },
}));

const { NoTimesNudge } = await import('./no-times-nudge');

function renderNudge(store = createStore(), scheduleButtonRef?: { current: HTMLButtonElement | null }) {
  render(
    <Provider store={store}>
      <NoTimesNudge scheduleButtonRef={scheduleButtonRef} />
    </Provider>
  );
  return store;
}

afterEach(() => {
  cleanup();
  Object.assign(mocks, { authenticated: true, loaded: true, hasTimes: false });
  localStorage.clear();
});

describe('NoTimesNudge', () => {
  it('says once, in one line, that no times are set, and opens the editor', () => {
    renderNudge();

    expect(screen.getByTestId('no-times-nudge')).toHaveTextContent('You have no times set.');
    fireEvent.click(screen.getByRole('button', { name: 'Set my times' }));
    expect(screen.getByRole('dialog', { name: 'My times' })).toBeInTheDocument();
  });

  it('stays away once dismissed, including on the next open', () => {
    const store = renderNudge();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByTestId('no-times-nudge')).not.toBeInTheDocument();

    cleanup();
    renderNudge(store);
    expect(screen.queryByTestId('no-times-nudge')).not.toBeInTheDocument();
  });

  it.each([
    ['with times set', { hasTimes: true }],
    ['signed out', { authenticated: false }],
    ['before the schedule has loaded', { loaded: false }],
  ])('draws nothing %s', (_label, state) => {
    Object.assign(mocks, state);
    renderNudge();

    expect(screen.queryByTestId('no-times-nudge')).not.toBeInTheDocument();
  });

  it('wears the purple-tint token rather than a literal colour', () => {
    renderNudge();

    expect(screen.getByTestId('no-times-nudge')).toHaveClass('bg-purple-tint');
  });

  // Saving times takes this line away, so the editor must not hand focus back to it.
  it('sends focus to the availability pill once saving times removes the line', () => {
    const pill = document.createElement('button');
    document.body.appendChild(pill);
    renderNudge(createStore(), { current: pill });

    fireEvent.click(screen.getByRole('button', { name: 'Set my times' }));
    expect(mocks.modal?.openerRef?.current).toBe(screen.getByRole('button', { name: 'Set my times' }));

    mocks.hasTimes = true;
    mocks.modal?.onSaved?.([]);

    expect(mocks.modal?.openerRef?.current).toBe(pill);
    pill.remove();
  });
});

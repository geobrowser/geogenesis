import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UpcomingDebateRoom } from '../api';
import { RoomNudgePopup } from './room-nudge-popup';
import { useHoldScheduledNotice } from './scheduled-notice-open';

// GEO-3428, board 6c: where the nudge popup comes from, and when it goes.

const state = vi.hoisted(() => ({
  onClose: null as null | (() => void),
  onAnswering: null as null | (() => void),
  mounts: 0,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function Dialog({
      requestId,
      initialStep,
      onClose,
      onAnswering,
    }: {
      requestId: string;
      initialStep: string;
      onClose: () => void;
      onAnswering: () => void;
    }) {
      state.onClose = onClose;
      state.onAnswering = onAnswering;
      React.useEffect(() => {
        state.mounts += 1;
      }, []);
      return <div data-testid="popup" data-request={requestId} data-step={initialStep} />;
    },
}));
vi.mock('./scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: { requests: [{ request_id: 'req-1', room_id: 'room-1', participants: [] }] } }),
}));

afterEach(cleanup);

const FIRST = '2026-10-21T17:04:00.000Z';
const SECOND = '2026-10-21T17:19:00.000Z';

const room = (nudged_at?: string, extra: Partial<UpcomingDebateRoom> = {}): UpcomingDebateRoom => ({
  room_id: 'room-1',
  starts_at: '2026-10-21T17:00:00.000Z',
  opens_at: '2026-10-21T16:50:00.000Z',
  joinable: true,
  due: true,
  others_present: true,
  kind: 'debate',
  ...(nudged_at ? { nudged_at } : {}),
  ...extra,
});

function popup(rooms: UpcomingDebateRoom[], enabled = true, onOpenChange = () => {}) {
  return <RoomNudgePopup rooms={rooms} enabled={enabled} onOpenChange={onOpenChange} />;
}

const shown = () => screen.queryByTestId('popup');

describe('RoomNudgePopup', () => {
  it('opens on the nudge step for a nudged room, and holds the banner back', () => {
    const onOpenChange = vi.fn();
    render(popup([room(FIRST)], true, onOpenChange));
    expect(shown()).toHaveAttribute('data-step', 'nudge');
    expect(shown()).toHaveAttribute('data-request', 'req-1');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('goes when the nudge is answered elsewhere before this tab answers it', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(popup([room(FIRST)], true, onOpenChange));
    rerender(popup([room()], true, onOpenChange));
    expect(shown()).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('stays up once they are answering, even as the answer clears the nudge', () => {
    const { rerender } = render(popup([room(FIRST)]));
    act(() => state.onAnswering?.());
    rerender(popup([room()]));
    expect(shown()).toBeInTheDocument();
  });

  // The popup says the waiting debater is in the room.
  it('does not open, or goes, once the one who nudged has left the room', () => {
    const { rerender } = render(popup([room(FIRST, { others_present: false })]));
    expect(shown()).not.toBeInTheDocument();
    rerender(popup([room(FIRST)]));
    expect(shown()).toBeInTheDocument();
    rerender(popup([room(FIRST, { others_present: false })]));
    expect(shown()).not.toBeInTheDocument();
  });

  it('steps aside while it is not allowed, and comes back only if the nudge still stands', () => {
    const { rerender } = render(popup([room(FIRST)]));
    rerender(popup([room(FIRST)], false));
    expect(shown()).not.toBeInTheDocument();
    rerender(popup([room(FIRST)]));
    expect(shown()).toBeInTheDocument();

    rerender(popup([room(FIRST)], false));
    rerender(popup([room()], false));
    rerender(popup([room()]));
    expect(shown()).not.toBeInTheDocument();
  });

  it('never stacks on another Running late or Can’t make it dialog', () => {
    const other = renderHook(({ active }) => useHoldScheduledNotice(active), { initialProps: { active: true } });
    render(popup([room(FIRST)]));
    expect(shown()).not.toBeInTheDocument();
    other.rerender({ active: false });
    expect(shown()).toBeInTheDocument();
    other.unmount();
  });

  // Mid-answer, a second nudge does not replace the popup; closing must cover it too.
  it('stays closed once closed, including for a nudge that landed while it was up', () => {
    const { rerender } = render(popup([room(FIRST)]));
    act(() => state.onAnswering?.());
    rerender(popup([room(SECOND)]));
    act(() => state.onClose?.());
    rerender(popup([room(SECOND)]));
    expect(shown()).not.toBeInTheDocument();

    rerender(popup([room('2026-10-21T17:34:00.000Z')]));
    expect(shown()).toBeInTheDocument();
  });

  // The same question asked again: no close-and-reopen, and the banner never gets a frame.
  it('keeps the same popup up when a newer nudge lands before it is answered', () => {
    state.mounts = 0;
    const onOpenChange = vi.fn();
    const { rerender } = render(popup([room(FIRST)], true, onOpenChange));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    onOpenChange.mockClear();
    rerender(popup([room(SECOND)], true, onOpenChange));
    expect(shown()).toBeInTheDocument();
    expect(state.mounts).toBe(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    // And closing it then counts the newer one too.
    act(() => state.onClose?.());
    rerender(popup([room(SECOND)], true, onOpenChange));
    expect(shown()).not.toBeInTheDocument();
  });

  it('never interrupts a room, a debate or a reminded lobby', () => {
    render(popup([room(FIRST)], false));
    expect(shown()).not.toBeInTheDocument();
    cleanup();
    render(popup([room(FIRST, { kind: 'lobby' })]));
    expect(shown()).not.toBeInTheDocument();
  });
});

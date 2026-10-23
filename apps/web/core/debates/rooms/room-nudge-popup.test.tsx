import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UpcomingDebateRoom } from '../api';
import { RoomNudgePopup } from './room-nudge-popup';

// GEO-3428, board 6c: where the nudge popup comes from.

const state = vi.hoisted(() => ({ onClose: null as null | (() => void) }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function Dialog({
      requestId,
      initialStep,
      onClose,
    }: {
      requestId: string;
      initialStep: string;
      onClose: () => void;
    }) {
      state.onClose = onClose;
      return <div data-testid="popup" data-request={requestId} data-step={initialStep} />;
    },
}));
vi.mock('./scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: { requests: [{ request_id: 'req-1', room_id: 'room-1', participants: [] }] } }),
}));

afterEach(cleanup);

const room = (nudged_at?: string): UpcomingDebateRoom => ({
  room_id: 'room-1',
  starts_at: '2026-10-21T17:00:00.000Z',
  opens_at: '2026-10-21T16:50:00.000Z',
  joinable: true,
  due: true,
  others_present: true,
  kind: 'debate',
  ...(nudged_at ? { nudged_at } : {}),
});

describe('RoomNudgePopup', () => {
  it('opens on the nudge step for a nudged room, and holds the banner back', () => {
    const onOpenChange = vi.fn();
    render(<RoomNudgePopup rooms={[room('2026-10-21T17:04:00.000Z')]} enabled onOpenChange={onOpenChange} />);
    expect(screen.getByTestId('popup')).toHaveAttribute('data-step', 'nudge');
    expect(screen.getByTestId('popup')).toHaveAttribute('data-request', 'req-1');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('stays up when answering clears the nudge, until closed; a second nudge opens it again', () => {
    const { rerender } = render(
      <RoomNudgePopup rooms={[room('2026-10-21T17:04:00.000Z')]} enabled onOpenChange={() => {}} />
    );
    rerender(<RoomNudgePopup rooms={[room()]} enabled onOpenChange={() => {}} />);
    expect(screen.getByTestId('popup')).toBeInTheDocument();

    act(() => state.onClose?.());
    rerender(<RoomNudgePopup rooms={[room('2026-10-21T17:04:00.000Z')]} enabled onOpenChange={() => {}} />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    rerender(<RoomNudgePopup rooms={[room('2026-10-21T17:19:00.000Z')]} enabled onOpenChange={() => {}} />);
    expect(screen.getByTestId('popup')).toBeInTheDocument();
  });

  it('never interrupts a room, a debate or a lobby', () => {
    render(<RoomNudgePopup rooms={[room('2026-10-21T17:04:00.000Z')]} enabled={false} onOpenChange={() => {}} />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    cleanup();
    render(
      <RoomNudgePopup
        rooms={[{ ...room('2026-10-21T17:04:00.000Z'), kind: 'lobby' }]}
        enabled
        onOpenChange={() => {}}
      />
    );
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });
});

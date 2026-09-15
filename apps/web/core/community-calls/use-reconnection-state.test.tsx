import { act, renderHook } from '@testing-library/react';

import { ConnectionState, DisconnectReason, Room } from 'livekit-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportCallDisconnect } from './disconnect-telemetry';
import { useReconnectionState } from './use-reconnection-state';

vi.mock('./disconnect-telemetry', () => ({ reportCallDisconnect: vi.fn() }));

const TELEMETRY = {
  spaceId: 'space-1',
  callId: 'call-1',
  roomName: 'space-1::call-1::1772130000000',
  occurrenceStart: 1772130000000,
  role: 'participant' as const,
  participantIdentity: 'participant-a',
};

/**
 * Minimal stand-in for LiveKit's Room. Only the event emitter matters here, and using the
 * real Room would require a signalling connection.
 */
function createFakeRoom() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const room = {
    // The real Room always has this; the episode's participant count reads it.
    remoteParticipants: new Map<string, unknown>(),
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return room;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
      return room;
    },
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of [...(listeners.get(event) ?? [])]) handler(...args);
  };
  return { room: room as unknown as Room, emit, remotes: room.remoteParticipants };
}

const episodes = () => vi.mocked(reportCallDisconnect).mock.calls.map(([, episode]) => episode);

afterEach(() => {
  vi.mocked(reportCallDisconnect).mockClear();
});

describe('useReconnectionState episode reporting', () => {
  it('reports one recovered episode for a drop that reconnects', () => {
    const { room, emit } = createFakeRoom();
    const { result } = renderHook(() => useReconnectionState(room, vi.fn(), TELEMETRY));

    act(() => emit('reconnecting'));
    expect(result.current.status).toBe('reconnecting');
    act(() => emit('reconnected'));

    expect(result.current.status).toBe('connected');
    expect(episodes()).toHaveLength(1);
    expect(episodes()[0]).toMatchObject({ outcome: 'recovered' });
  });

  /**
   * The bug this guards: LiveKit emits `reconnecting`, `signalReconnecting` and a
   * `connectionStateChanged` through a single outage. Treating each as its own episode would
   * multiply every count, and restarting the clock on each would shrink the measured
   * duration to the last retry rather than the whole outage.
   */
  it('collapses a burst of reconnecting events into a single episode', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-26T12:00:00Z'));
      const { room, emit } = createFakeRoom();
      renderHook(() => useReconnectionState(room, vi.fn(), TELEMETRY));

      // One outage, reported on three channels over 30 seconds.
      act(() => emit('reconnecting'));
      vi.advanceTimersByTime(10_000);
      act(() => emit('signalReconnecting'));
      vi.advanceTimersByTime(10_000);
      act(() => emit('connectionStateChanged', ConnectionState.Reconnecting));
      vi.advanceTimersByTime(10_000);
      act(() => emit('reconnected'));

      expect(episodes()).toHaveLength(1);
      // The whole outage, not just the stretch after the last retry event — that is the
      // difference between a 30s outage and an apparent 10s one.
      expect(episodes()[0].reconnectingMs).toBe(30_000);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The bug this guards: one disconnect reaches the hook twice, via the `disconnected`
   * event and via `connectionStateChanged`. Reporting both would double every drop count.
   */
  it('reports a terminal disconnect once despite arriving on two channels', () => {
    const { room, emit } = createFakeRoom();
    renderHook(() => useReconnectionState(room, vi.fn(), TELEMETRY));

    act(() => {
      emit('disconnected', DisconnectReason.SIGNAL_CLOSE);
      emit('connectionStateChanged', ConnectionState.Disconnected);
    });

    expect(episodes()).toHaveLength(1);
    expect(episodes()[0]).toMatchObject({ outcome: 'left', reason: DisconnectReason.SIGNAL_CLOSE });
  });

  it('marks a drop that exhausted its retries as gave_up, not left', () => {
    const { room, emit } = createFakeRoom();
    renderHook(() => useReconnectionState(room, vi.fn(), TELEMETRY));

    act(() => emit('reconnecting'));
    act(() => emit('disconnected', DisconnectReason.SIGNAL_CLOSE));

    expect(episodes()).toHaveLength(1);
    expect(episodes()[0]).toMatchObject({ outcome: 'gave_up' });
  });

  /** Connecting for the first time is not a recovery from anything. */
  it('does not report the initial connect as a recovery', () => {
    const { room, emit } = createFakeRoom();
    renderHook(() => useReconnectionState(room, vi.fn(), TELEMETRY));

    act(() => emit('connectionStateChanged', ConnectionState.Connected));

    expect(episodes()).toHaveLength(0);
  });

  it('reports a second drop after a manual rejoin lifts the latch', () => {
    const { room, emit } = createFakeRoom();
    const { result } = renderHook(() => useReconnectionState(room, vi.fn(), TELEMETRY));

    act(() => emit('disconnected', DisconnectReason.SIGNAL_CLOSE));
    act(() => result.current.reset());
    act(() => emit('disconnected', DisconnectReason.SIGNAL_CLOSE));

    expect(episodes()).toHaveLength(2);
  });

  it('reports nothing at all when no telemetry context is supplied', () => {
    const { room, emit } = createFakeRoom();
    renderHook(() => useReconnectionState(room, vi.fn()));

    act(() => emit('reconnecting'));
    act(() => emit('reconnected'));
    act(() => emit('disconnected', DisconnectReason.SIGNAL_CLOSE));

    expect(episodes()).toHaveLength(0);
  });
});

describe('useReconnectionState cutoff handling', () => {
  it('shows the ended status instead of navigating away when the cutoff fires', () => {
    const { room, emit } = createFakeRoom();
    const onPermanentDisconnect = vi.fn();
    const { result } = renderHook(() => useReconnectionState(room, onPermanentDisconnect, TELEMETRY));

    act(() => result.current.markEndedByCutoff());
    act(() => emit('disconnected', DisconnectReason.CLIENT_INITIATED));

    expect(result.current.status).toBe('ended');
    expect(onPermanentDisconnect).not.toHaveBeenCalled();
    expect(episodes()[0]).toMatchObject({ endedByCutoff: true });
  });

  /** Without the cutoff marker, CLIENT_INITIATED must still navigate away as before. */
  it('navigates away on an unmarked voluntary leave', () => {
    const { room, emit } = createFakeRoom();
    const onPermanentDisconnect = vi.fn();
    const { result } = renderHook(() => useReconnectionState(room, onPermanentDisconnect, TELEMETRY));

    act(() => emit('disconnected', DisconnectReason.CLIENT_INITIATED));

    expect(onPermanentDisconnect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('connected');
  });

  it('still shows the overlay for a drop that is not the cutoff', () => {
    const { room, emit } = createFakeRoom();
    const onPermanentDisconnect = vi.fn();
    const { result } = renderHook(() => useReconnectionState(room, onPermanentDisconnect, TELEMETRY));

    act(() => emit('disconnected', DisconnectReason.DUPLICATE_IDENTITY));

    expect(result.current.status).toBe('disconnected');
    expect(result.current.disconnectReason).toBe(DisconnectReason.DUPLICATE_IDENTITY);
    expect(onPermanentDisconnect).not.toHaveBeenCalled();
  });
});

// Attribution was the module's whole purpose and it could not do it: with no identity and
// no room size, five episodes in one room read identically whether that is one flaky
// connection or five people hit by one server event.
describe('useReconnectionState drop attribution', () => {
  it('reports the room size as it was when the trouble started, not after the teardown', () => {
    const { room, emit, remotes } = createFakeRoom();
    remotes.set('b', {});
    remotes.set('c', {});
    renderHook(() => useReconnectionState(room, () => {}, TELEMETRY));

    act(() => emit('reconnecting'));
    // LiveKit tears the participant list down before the disconnect resolves, so a count
    // read at report time would always be 1.
    remotes.clear();
    act(() => emit('disconnected', DisconnectReason.SIGNAL_CLOSE));

    expect(episodes()[0]?.participantCount).toBe(3);
  });

  it('still reports a count for an immediate disconnect with no episode open', () => {
    const { room, emit, remotes } = createFakeRoom();
    remotes.set('b', {});
    renderHook(() => useReconnectionState(room, () => {}, TELEMETRY));

    act(() => emit('disconnected', DisconnectReason.SERVER_SHUTDOWN));

    expect(episodes()[0]?.participantCount).toBe(2);
  });
});

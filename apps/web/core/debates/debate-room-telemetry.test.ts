import type { Room } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const room = {} as Room;
const telemetryModule = '~/core/debates/use-voice-call-telemetry';

describe('optional debate room telemetry', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.doUnmock(telemetryModule);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('allows the join to continue when the telemetry chunk fails to load', async () => {
    vi.doMock(telemetryModule, () => {
      throw new Error('chunk load failed');
    });
    const { loadDebateRoomTelemetry } = await import('./debate-room-telemetry');
    const start = await loadDebateRoomTelemetry();
    expect(() => start(room, 'd', 1, () => null).stop()).not.toThrow();
  });

  it('bounds a telemetry chunk that never loads', async () => {
    vi.useFakeTimers();
    vi.doMock(telemetryModule, () => new Promise(() => {}));
    const { loadDebateRoomTelemetry } = await import('./debate-room-telemetry');
    const pending = loadDebateRoomTelemetry();
    await vi.advanceTimersByTimeAsync(5_000);
    const start = await pending;
    expect(() => start(room, 'd', 1, () => null).stop()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['setup', 'session id', 'stop'] as const)('isolates a telemetry %s exception', async failure => {
    const stop = vi.fn(() => {
      if (failure === 'stop') throw new Error('stop failed');
    });
    const startVoiceCallTelemetry = vi.fn(() => {
      if (failure === 'setup') throw new Error('setup failed');
      return stop;
    });
    vi.doMock(telemetryModule, () => ({ startVoiceCallTelemetry }));
    const { loadDebateRoomTelemetry } = await import('./debate-room-telemetry');
    const start = await loadDebateRoomTelemetry();
    if (failure === 'session id') {
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
        throw new Error('session id failed');
      });
    }
    expect(() => start(room, 'd', 1, () => null).stop()).not.toThrow();
  });

  it('passes attribution through and stops healthy telemetry', async () => {
    const stop = vi.fn();
    const startVoiceCallTelemetry = vi.fn(() => stop);
    vi.doMock(telemetryModule, () => ({ startVoiceCallTelemetry }));
    const { loadDebateRoomTelemetry } = await import('./debate-room-telemetry');
    const start = await loadDebateRoomTelemetry();
    const telemetry = start(room, 'd', 2, () => null);
    expect(startVoiceCallTelemetry).toHaveBeenCalledWith(
      room,
      'debate',
      'd',
      { debate_id: 'd', participant_slot: 2, call_session_id: expect.any(String) },
      { probe: expect.any(Function) }
    );
    telemetry.stop();
    expect(stop).toHaveBeenCalledOnce();
  });
});

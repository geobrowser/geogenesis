import type { Room } from 'livekit-client';

import { resolveWithin } from '~/core/utils/resolve-within';

const noop = () => {};
type StartTelemetry = (room: Room, debateId: string, participantSlot: number) => () => void;

/** Diagnostics are optional: loading, setup and cleanup must never fail a call. */
export async function loadDebateRoomTelemetry(): Promise<StartTelemetry> {
  try {
    const telemetry = await resolveWithin(() => import('./use-voice-call-telemetry'), 5_000, null);
    if (!telemetry) return () => noop;
    return (room, debateId, participantSlot) => {
      try {
        const stop = telemetry.startVoiceCallTelemetry(room, 'debate', debateId, {
          debate_id: debateId,
          participant_slot: participantSlot,
          call_session_id: crypto.randomUUID(),
        });
        return () => {
          try {
            stop();
          } catch {
            // Room teardown must still run if diagnostics cleanup fails.
          }
        };
      } catch {
        return noop;
      }
    };
  } catch {
    return () => noop;
  }
}

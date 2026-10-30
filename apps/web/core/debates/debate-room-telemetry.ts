import type { Room } from 'livekit-client';

import { resolveWithin } from '~/core/utils/resolve-within';

export type DebateRoomTelemetry = {
  stop: () => void;
  /** A speaker the person chose could not be applied to the live room. */
  audioOutputFailed: (error: unknown) => void;
};

const noop = () => {};
const inert: DebateRoomTelemetry = { stop: noop, audioOutputFailed: noop };

type StartTelemetry = (
  room: Room,
  debateId: string,
  participantSlot: number,
  /** The chosen speaker, or null where the browser cannot route audio. */
  audioOutputId: () => string | null
) => DebateRoomTelemetry;

/** Diagnostics are optional: loading, setup and cleanup must never fail a call. */
export async function loadDebateRoomTelemetry(): Promise<StartTelemetry> {
  try {
    const modules = await resolveWithin(
      () => Promise.all([import('./use-voice-call-telemetry'), import('./debate-playback-telemetry')]),
      5_000,
      null
    );
    if (!modules) return () => inert;
    const [telemetry, playback] = modules;
    return (room, debateId, participantSlot, audioOutputId) => {
      try {
        let probe: ReturnType<ReturnType<typeof playback.debatePlaybackProbe>> | undefined;
        const startProbe = playback.debatePlaybackProbe(room, audioOutputId);
        const stop = telemetry.startVoiceCallTelemetry(
          room,
          'debate',
          debateId,
          { debate_id: debateId, participant_slot: participantSlot, call_session_id: crypto.randomUUID() },
          { probe: report => (probe = startProbe(report)) }
        );
        return {
          stop: () => {
            try {
              stop();
            } catch {
              // Room teardown must still run if diagnostics cleanup fails.
            }
          },
          audioOutputFailed: error => {
            try {
              probe?.audioOutputFailed(error);
            } catch {
              // Diagnostics only.
            }
          },
        };
      } catch {
        return inert;
      }
    };
  } catch {
    return () => inert;
  }
}

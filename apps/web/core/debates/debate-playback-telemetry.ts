import { type RemoteTrackPublication, type Room, RoomEvent, Track } from 'livekit-client';

import { resolveWithin } from '~/core/utils/resolve-within';

import {
  type AudioOutputState,
  type RecvAudioState,
  type RecvVideoState,
  type RemoteMediaLike,
  type VideoReceiverSnapshot,
  audioOutputState,
  readVideoReceiverReport,
  recvAudioState,
  recvVideoFps,
  recvVideoState,
} from './debate-playback-stats';
import { type CallProbe, type ReportCallChange, trackSwitches } from './use-voice-call-telemetry';
import { statsEntries } from './voice-call-stats';

/** Long enough for a freshly attached element's `play()` to settle, so a start is not read as a pause. */
export const PLAYBACK_CHECK_DELAY_MS = 1_000;

const RECHECK_EVENTS = [
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.AudioPlaybackStatusChanged,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
] as const;

/**
 * Whether the opponent is heard and seen, not only received (GEO-3511). Adds to each debate sample
 * the state of their audio and camera here, the decoded frame rate and layer, and where the audio is
 * routed; reports each change of those as it happens. Element and track state are read on room
 * events and with each sample, never per frame.
 *
 * @param audioOutputId the speaker the person chose, or null where the browser cannot route audio.
 */
export function debatePlaybackProbe(room: Room, audioOutputId: () => string | null) {
  return (report: ReportCallChange): DebatePlaybackProbe => {
    const audio = trackSwitches<RecvAudioState>((next, previous) =>
      report({ change: 'recv_audio', recv_audio_state: next, previous_recv_audio_state: previous })
    );
    const video = trackSwitches<RecvVideoState>((next, previous) =>
      report({ change: 'recv_video', recv_video_state: next, previous_recv_video_state: previous })
    );
    const output = trackSwitches<AudioOutputState>((next, previous) =>
      report({ change: 'audio_output', audio_output: next, previous_audio_output: previous })
    );
    let previousVideo: (VideoReceiverSnapshot & { trackId?: string }) | undefined;
    /** The last measured decode rate, so a frozen picture stays frozen between samples. */
    let measured: { trackId?: string; fps: number | null } = { fps: null };
    let pending: ReturnType<typeof setTimeout> | undefined;

    const publication = (source: Track.Source) => {
      for (const participant of room.remoteParticipants.values()) {
        const found = participant.getTrackPublication(source) as RemoteTrackPublication | undefined;
        if (found?.track) return found;
      }
      return undefined;
    };
    const media = (found: RemoteTrackPublication | undefined): RemoteMediaLike | null =>
      found?.track ? { muted: found.isMuted, elements: found.track.attachedElements } : null;

    const check = (available?: readonly string[]) => {
      const heard = media(publication(Track.Source.Microphone));
      const camera = publication(Track.Source.Camera);
      // A new camera track has no decode rate yet.
      const fps = camera?.track?.mediaStreamTrack?.id === measured.trackId ? measured.fps : null;
      audio.note(recvAudioState(heard, room.canPlaybackAudio));
      video.note(recvVideoState(media(camera), fps));
      output.note(audioOutputState(audioOutputId(), heard, available));
    };
    const scheduleCheck = () => {
      clearTimeout(pending);
      pending = setTimeout(() => check(), PLAYBACK_CHECK_DELAY_MS);
    };
    for (const event of RECHECK_EVENTS) room.on(event, scheduleCheck);

    return {
      async sample() {
        const camera = publication(Track.Source.Camera);
        const track = camera?.track;
        let fps: number | null = null;
        let height: number | null = null;
        if (track) {
          const report = await resolveWithin(async () => track.getRTCStatsReport(), 5_000, null);
          if (report) {
            const current = { ...readVideoReceiverReport(statsEntries(report)), trackId: track.mediaStreamTrack?.id };
            fps = previousVideo?.trackId === current.trackId ? recvVideoFps(current, previousVideo) : null;
            height = current.frameHeight ?? null;
            previousVideo = current;
          }
        }
        measured = { trackId: track?.mediaStreamTrack?.id, fps };
        check(await audioOutputs());
        return {
          recv_audio_state: audio.current(),
          recv_video_state: video.current(),
          recv_video_fps: fps,
          recv_video_height: height,
          audio_output: output.current(),
        };
      },
      audioOutputFailed(error: unknown) {
        report({ change: 'audio_output_failed', reason: audioOutputFailure(error) });
      },
      stop() {
        clearTimeout(pending);
        for (const event of RECHECK_EVENTS) room.off(event, scheduleCheck);
      },
    };
  };
}

export type DebatePlaybackProbe = CallProbe & {
  /** A speaker the person chose could not be applied. */
  audioOutputFailed: (error: unknown) => void;
};

/** The speakers the browser lists, or undefined when it will not say. */
async function audioOutputs() {
  try {
    const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? null;
    const outputs = devices?.filter(device => device.kind === 'audiooutput');
    // Without media permission the browser lists devices with their ids blanked.
    if (!outputs || outputs.some(device => !device.deviceId)) return undefined;
    return outputs.map(device => device.deviceId);
  } catch {
    return undefined;
  }
}

/**
 * The browser's reason, by name only. `NotFoundError` is a speaker that is gone; a plain `Error` is
 * LiveKit declining the switch.
 */
export function audioOutputFailure(error: unknown) {
  // A DOMException is not an Error in every runtime.
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === 'string' && name && name !== 'Error' ? name : 'switch_failed';
}

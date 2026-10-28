import type { LocalParticipant, LocalTrack } from 'livekit-client';

export type LobbyCamera = {
  /** Acquires and publishes the camera; a no-op while one is held. Rejects only for the current attempt. */
  enable: () => Promise<void>;
  /** Stops the camera at once, published or still being acquired or published. */
  release: () => void;
  /** Whether a camera is held: being acquired, publishing or published. */
  held: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

/**
 * This tab's lobby camera. Acquired and published here rather than with `setCameraEnabled`, whose
 * track has no publication until its publish finishes, so a release could not reach it in between.
 */
export function createLobbyCamera(participant: LocalParticipant): LobbyCamera {
  // Bumped by every release, so an attempt that resolves after one never keeps or publishes its track.
  let generation = 0;
  let acquiring = false;
  let track: LocalTrack | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());

  const release = () => {
    generation += 1;
    const held = track;
    const changed = acquiring || held !== null;
    acquiring = false;
    track = null;
    if (held) {
      held.stop();
      // Waits out a publish in flight, then unpublishes.
      void participant.unpublishTrack(held, true).catch(() => undefined);
    }
    if (changed) notify();
  };

  const enable = async () => {
    if (acquiring || track) return;
    const attempt = ++generation;
    acquiring = true;
    notify();

    let created: LocalTrack | undefined;
    try {
      // Takes the room's capture defaults and selected camera, as `setCameraEnabled` does.
      [created] = await participant.createTracks({ video: true });
      if (!created) throw new Error('No camera track');
    } catch (error) {
      if (attempt !== generation) return;
      acquiring = false;
      notify();
      throw error;
    }
    if (attempt !== generation) {
      created.stop();
      return;
    }
    track = created;

    try {
      // Takes the room's publish defaults (simulcast layers, bitrate).
      await participant.publishTrack(created);
    } catch (error) {
      if (attempt !== generation) return;
      release();
      throw error;
    }
    if (attempt === generation) acquiring = false;
  };

  return {
    enable,
    release,
    held: () => acquiring || track !== null,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

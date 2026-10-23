import * as LiveKit from 'livekit-client';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setLocalTrackEnabled } from './media-session';

class CaptureTrack extends EventTarget {
  enabled = true;
  muted = false;
  readyState = 'live';
  id = crypto.randomUUID();
  constructor(readonly kind: 'audio' | 'video') {
    super();
  }
  getConstraints() {
    return { deviceId: 'device-1' };
  }
  getSettings() {
    return { deviceId: 'device-1', width: 640, height: 480 };
  }
  applyConstraints = vi.fn().mockResolvedValue(undefined);
  stop() {
    this.readyState = 'ended';
  }
}
class CaptureStream {
  constructor(private tracks: CaptureTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter(track => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter(track => track.kind === 'video');
  }
}

beforeEach(() => vi.stubGlobal('MediaStream', CaptureStream));
afterEach(() => vi.unstubAllGlobals());

const entryPoints = [
  ['import', LiveKit],
  ['require', createRequire(import.meta.url)('livekit-client') as typeof LiveKit],
] as const;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const [entryPoint, sdk] of entryPoints) {
  describe(`LiveKit input restart gating (${entryPoint})`, () => {
    async function input(kind: 'audio' | 'video') {
      const getUserMedia = vi.fn(async () => new CaptureStream([new CaptureTrack(kind)]));
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
      const original = new CaptureTrack(kind) as unknown as MediaStreamTrack;
      const track =
        kind === 'audio'
          ? new sdk.LocalAudioTrack(original, undefined, false)
          : new sdk.LocalVideoTrack(original, undefined, false);
      // The first restart also waits for the constructor's asynchronous track setup.
      await track.restartTrack();
      return { track, getUserMedia };
    }

    it.each(['audio', 'video'] as const)('keeps a disabled %s disabled before sender replacement', async kind => {
      const { track } = await input(kind);
      setLocalTrackEnabled(track, false);
      const sent: boolean[] = [];
      track.sender = {
        replaceTrack: vi.fn(async (next: MediaStreamTrack) => {
          sent.push(next.enabled);
        }),
        getParameters: () => ({ encodings: [] }),
        setParameters: vi.fn().mockResolvedValue(undefined),
      } as unknown as RTCRtpSender;
      try {
        await track.restartTrack();
        expect(sent).toEqual([false]);
        expect(track.mediaStreamTrack.enabled).toBe(false);
        expect(track.mediaStream?.getTracks()[0].enabled).toBe(false);
      } finally {
        track.stop();
      }
    });

    it.each(['audio', 'video'] as const)(
      'applies a gate changed during %s acquisition before sender replacement',
      async kind => {
        const { track, getUserMedia } = await input(kind);
        const acquiring = deferred();
        getUserMedia.mockImplementationOnce(async () => {
          await acquiring.promise;
          return new CaptureStream([new CaptureTrack(kind)]);
        });
        const sent: boolean[] = [];
        track.sender = {
          replaceTrack: vi.fn(async (next: MediaStreamTrack) => {
            sent.push(next.enabled);
          }),
          getParameters: () => ({ encodings: [] }),
          setParameters: vi.fn().mockResolvedValue(undefined),
        } as unknown as RTCRtpSender;
        try {
          const restarting = track.restartTrack();
          await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
          setLocalTrackEnabled(track, false);
          acquiring.resolve();
          await restarting;
          expect(sent).toEqual([false]);
          expect(track.mediaStreamTrack.enabled).toBe(false);
        } finally {
          track.stop();
        }
      }
    );

    it('gates a newly attached microphone processor before sender replacement', async () => {
      const { track } = await input('audio');
      (track as LiveKit.LocalAudioTrack).setAudioContext({} as AudioContext);
      setLocalTrackEnabled(track, false);
      const sent: boolean[] = [];
      track.sender = {
        replaceTrack: vi.fn(async (next: MediaStreamTrack) => {
          sent.push(next.enabled);
        }),
      } as unknown as RTCRtpSender;
      const processor = {
        name: 'test-noise-filter',
        processedTrack: new CaptureTrack('audio') as unknown as MediaStreamTrack,
        init: async () => {},
        restart: async () => {},
        destroy: async () => {},
      };
      try {
        await track.setProcessor(processor);
        expect(sent).toEqual([false]);
        expect(track.mediaStreamTrack.enabled).toBe(false);
      } finally {
        track.stop();
      }
    });

    it('gates processed microphone output before sender replacement', async () => {
      const { track } = await input('audio');
      (track as LiveKit.LocalAudioTrack).setAudioContext({} as AudioContext);
      const processor = {
        name: 'test-noise-filter',
        processedTrack: new CaptureTrack('audio') as unknown as MediaStreamTrack,
        init: async () => {},
        restart: async () => {
          processor.processedTrack = new CaptureTrack('audio') as unknown as MediaStreamTrack;
        },
        destroy: async () => {},
      };
      await track.setProcessor(processor);
      setLocalTrackEnabled(track, false);
      const sent: boolean[] = [];
      track.sender = {
        replaceTrack: vi.fn(async (next: MediaStreamTrack) => {
          sent.push(next.enabled);
        }),
      } as unknown as RTCRtpSender;
      try {
        await track.restartTrack();
        expect(sent).toEqual([false]);
        expect(track.mediaStreamTrack.enabled).toBe(false);
        expect(track.mediaStream?.getTracks()[0].enabled).toBe(false);
      } finally {
        track.stop();
      }
    });

    it('honors a gate changed while the microphone processor is restarting', async () => {
      const { track } = await input('audio');
      (track as LiveKit.LocalAudioTrack).setAudioContext({} as AudioContext);
      const processing = deferred();
      const processor = {
        name: 'test-noise-filter',
        processedTrack: new CaptureTrack('audio') as unknown as MediaStreamTrack,
        init: async () => {},
        restart: vi.fn(async () => {
          await processing.promise;
          processor.processedTrack = new CaptureTrack('audio') as unknown as MediaStreamTrack;
        }),
        destroy: async () => {},
      };
      await track.setProcessor(processor);
      const sent: boolean[] = [];
      track.sender = {
        replaceTrack: vi.fn(async (next: MediaStreamTrack) => {
          sent.push(next.enabled);
        }),
      } as unknown as RTCRtpSender;
      try {
        const restarting = track.restartTrack();
        await vi.waitFor(() => expect(processor.restart).toHaveBeenCalledOnce());
        setLocalTrackEnabled(track, false);
        processing.resolve();
        await restarting;
        expect(sent).toEqual([false]);
        expect(track.mediaStreamTrack.enabled).toBe(false);
      } finally {
        track.stop();
      }
    });

    it.each(['audio', 'video'] as const)('keeps an enabled %s enabled across restart', async kind => {
      const { track } = await input(kind);
      try {
        await track.restartTrack();
        expect(track.mediaStreamTrack.enabled).toBe(true);
      } finally {
        track.stop();
      }
    });

    it.each(['audio', 'video'] as const)('still allows the SDK to deliberately unmute %s', async kind => {
      const { track } = await input(kind);
      track.source = kind === 'audio' ? sdk.Track.Source.Microphone : sdk.Track.Source.Camera;
      try {
        await track.mute();
        await track.unmute();
        expect(track.isMuted).toBe(false);
        expect(track.mediaStreamTrack.enabled).toBe(true);
      } finally {
        track.stop();
      }
    });

    it.each(['audio', 'video'] as const)('does not reopen a gate changed during %s sender replacement', async kind => {
      const { track } = await input(kind);
      const replacing = deferred();
      const replaceTrack = vi.fn(async () => {
        await replacing.promise;
      });
      track.sender = {
        replaceTrack,
        getParameters: () => ({ encodings: [] }),
        setParameters: vi.fn().mockResolvedValue(undefined),
      } as unknown as RTCRtpSender;
      try {
        const restarting = track.restartTrack();
        await vi.waitFor(() => expect(replaceTrack).toHaveBeenCalledOnce());
        setLocalTrackEnabled(track, false);
        replacing.resolve();
        await restarting;
        expect(track.mediaStreamTrack.enabled).toBe(false);
        expect(track.mediaStream?.getTracks()[0].enabled).toBe(false);
      } finally {
        track.stop();
      }
    });
  });
}

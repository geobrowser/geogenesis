import type { RoomOptions } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import { withMediaDeviceOptions } from './device-options';

describe('room device options', () => {
  it('keeps lobby capture quality and publishing settings while making saved inputs optional', () => {
    const base: RoomOptions = {
      videoCaptureDefaults: { resolution: { width: 640, height: 360, frameRate: 20 } },
      audioCaptureDefaults: { echoCancellation: true },
      publishDefaults: { red: true, dtx: true },
      dynacast: true,
    };
    const room = withMediaDeviceOptions(
      { audioInputId: 'mic', videoInputId: 'camera', audioOutputId: 'speaker' },
      base
    );
    expect(room.audioCaptureDefaults).toEqual({ echoCancellation: true, deviceId: { ideal: 'mic' } });
    expect(room.videoCaptureDefaults).toEqual({
      resolution: { width: 640, height: 360, frameRate: 20 },
      deviceId: { ideal: 'camera' },
    });
    expect(room.audioOutput).toEqual({ deviceId: 'speaker' });
    expect(room.publishDefaults).toBe(base.publishDefaults);
    expect(room.dynacast).toBe(true);
    expect(base.audioCaptureDefaults).toEqual({ echoCancellation: true });
    expect(base.videoCaptureDefaults).toEqual({ resolution: { width: 640, height: 360, frameRate: 20 } });
  });
});

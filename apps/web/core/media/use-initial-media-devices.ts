'use client';

import * as React from 'react';

import { supportsAudioOutputSelection } from 'livekit-client';

import { availableMediaDeviceId, readMediaDevicePreference } from './device-preferences';

type InitialMediaDevices = {
  ready: boolean;
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
};

/**
 * Read on entry to a room, before it captures or plays media. Freeze the result for this visit:
 * changing LiveKitRoom's options during a call would rebuild the room and disconnect everyone.
 * Pickers switch the live room separately and save only explicit choices for the next visit.
 */
export function useInitialMediaDevices(fallback: Omit<InitialMediaDevices, 'ready'> = {}) {
  const fallbackRef = React.useRef(fallback);
  const [devices, setDevices] = React.useState<InitialMediaDevices>({ ready: false });
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const audioInputId = readMediaDevicePreference('audioinput') ?? fallbackRef.current.audioInputId;
      const videoInputId = readMediaDevicePreference('videoinput') ?? fallbackRef.current.videoInputId;
      const audioOutputId = readMediaDevicePreference('audiooutput') ?? fallbackRef.current.audioOutputId;
      let list: MediaDeviceInfo[] = [];
      try {
        list = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
      } catch {
        // Capture can still work even when enumeration is unavailable.
      }
      if (cancelled) return;
      // Before permission, inputs can have blank IDs. Keep the preference as an ideal constraint
      // then; the browser can fall back without another prompt if that device is unavailable.
      const input = (kind: MediaDeviceKind, preferred: string | undefined) => {
        const available = list.filter(device => device.kind === kind && device.deviceId);
        return preferred && available.length ? availableMediaDeviceId(preferred, available) : preferred;
      };
      setDevices({
        ready: true,
        audioInputId: input('audioinput', audioInputId),
        videoInputId: input('videoinput', videoInputId),
        audioOutputId:
          audioOutputId && typeof supportsAudioOutputSelection === 'function' && supportsAudioOutputSelection()
            ? availableMediaDeviceId(
                audioOutputId,
                list.filter(device => device.kind === 'audiooutput')
              ) || 'default'
            : undefined,
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  return devices;
}

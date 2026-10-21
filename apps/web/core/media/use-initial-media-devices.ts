'use client';

import * as React from 'react';

import { supportsAudioOutputSelection } from 'livekit-client';

import type { MediaDeviceIds } from './device-options';
import { readMediaDevicePreference, resolveMediaDevicePreference } from './device-preferences';

type InitialMediaDevices = MediaDeviceIds & { ready: boolean };

/**
 * Read on entry to a room, before it captures or plays media. Freeze the result for this visit:
 * changing LiveKitRoom's options during a call would rebuild the room and disconnect everyone.
 * Pickers switch the live room separately and save only explicit choices for the next visit.
 */
export function useInitialMediaDevices(fallback: MediaDeviceIds = {}) {
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
      // Before permission, browsers can expose only the default device, even with a nonempty ID.
      // A list with hidden labels cannot tell us a saved device is disconnected. Keep the preference
      // then; capture uses ideal constraints and falls back without a second permission request.
      const input = (kind: 'audioinput' | 'videoinput', preferred: string | undefined) =>
        preferred
          ? resolveMediaDevicePreference(
              preferred,
              list.filter(device => device.kind === kind)
            ) || undefined
          : undefined;
      setDevices({
        ready: true,
        audioInputId: input('audioinput', audioInputId),
        videoInputId: input('videoinput', videoInputId),
        audioOutputId:
          audioOutputId && typeof supportsAudioOutputSelection === 'function' && supportsAudioOutputSelection()
            ? resolveMediaDevicePreference(
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

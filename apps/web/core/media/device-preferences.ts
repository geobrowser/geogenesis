'use client';

/** Browser-local choices only. Never include device identifiers or labels in telemetry. */
export const MEDIA_DEVICE_PREFERENCE_PREFIX = 'geo:media-device:';
const CHANGE_EVENT = 'geo:media-device-changed';

export function readMediaDevicePreference(kind: MediaDeviceKind): string | undefined {
  try {
    return window.localStorage.getItem(`${MEDIA_DEVICE_PREFERENCE_PREFIX}${kind}`) || undefined;
  } catch {
    // Storage can be disabled independently of camera/microphone permissions.
    return undefined;
  }
}

/** Only explicit picker actions call this; automatic defaults must never overwrite a choice. */
export function rememberMediaDevice(kind: MediaDeviceKind, deviceId: string) {
  if (!deviceId) return;
  try {
    window.localStorage.setItem(`${MEDIA_DEVICE_PREFERENCE_PREFIX}${kind}`, deviceId);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // A blocked/full storage area must not prevent switching devices.
  }
}

export function subscribeMediaDevicePreferences(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(MEDIA_DEVICE_PREFERENCE_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** Resolve an available device without changing the saved preference when it is unplugged. */
export function availableMediaDeviceId(preferred: string | undefined, devices: { deviceId: string }[]) {
  if (preferred && devices.some(device => device.deviceId === preferred)) return preferred;
  return devices.find(device => device.deviceId === 'default')?.deviceId || devices[0]?.deviceId || '';
}

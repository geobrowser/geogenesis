import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MEDIA_DEVICE_PREFERENCE_PREFIX,
  availableMediaDeviceId,
  readMediaDevicePreference,
  rememberMediaDevice,
  subscribeMediaDevicePreferences,
} from './device-preferences';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('browser media device preferences', () => {
  it('saves each kind independently without storing device labels', () => {
    rememberMediaDevice('audioinput', 'usb-mic');
    rememberMediaDevice('videoinput', 'usb-camera');
    rememberMediaDevice('audiooutput', 'headphones');
    expect(readMediaDevicePreference('audioinput')).toBe('usb-mic');
    expect(readMediaDevicePreference('videoinput')).toBe('usb-camera');
    expect(readMediaDevicePreference('audiooutput')).toBe('headphones');
    expect(window.localStorage.length).toBe(3);
  });

  it('uses the default while disconnected and restores the saved choice when it returns', () => {
    rememberMediaDevice('audioinput', 'usb-mic');
    expect(availableMediaDeviceId(readMediaDevicePreference('audioinput'), [{ deviceId: 'default' }])).toBe('default');
    expect(readMediaDevicePreference('audioinput')).toBe('usb-mic');
    expect(
      availableMediaDeviceId(readMediaDevicePreference('audioinput'), [
        { deviceId: 'default' },
        { deviceId: 'usb-mic' },
      ])
    ).toBe('usb-mic');
    expect(availableMediaDeviceId('missing', [{ deviceId: 'camera' }])).toBe('camera');
    expect(availableMediaDeviceId('missing', [])).toBe('');
  });

  it('notifies other surfaces in this tab and observes writes from another tab', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMediaDevicePreferences(listener);
    rememberMediaDevice('audioinput', 'mic');
    expect(listener).toHaveBeenCalledTimes(1);
    window.localStorage.setItem(`${MEDIA_DEVICE_PREFERENCE_PREFIX}audioinput`, 'other-mic');
    window.dispatchEvent(new StorageEvent('storage', { key: `${MEDIA_DEVICE_PREFERENCE_PREFIX}audioinput` }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(readMediaDevicePreference('audioinput')).toBe('other-mic');
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    rememberMediaDevice('audioinput', 'third-mic');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('continues when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(readMediaDevicePreference('audioinput')).toBeUndefined();
    expect(() => rememberMediaDevice('audioinput', 'mic')).not.toThrow();
  });
});

import { cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rememberMediaDevice } from './device-preferences';
import { useInitialMediaDevices } from './use-initial-media-devices';

const mocks = vi.hoisted(() => ({ enumerate: vi.fn(), supportsOutput: vi.fn() }));
vi.mock('livekit-client', () => ({ supportsAudioOutputSelection: mocks.supportsOutput }));

beforeEach(() => {
  window.localStorage.clear();
  mocks.enumerate.mockReset().mockResolvedValue([]);
  mocks.supportsOutput.mockReset().mockReturnValue(true);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: mocks.enumerate },
  });
});
afterEach(cleanup);

const list = [
  { kind: 'audioinput', deviceId: 'default', label: 'default' },
  { kind: 'audioinput', deviceId: 'usb-mic', label: 'usb-mic' },
  { kind: 'videoinput', deviceId: 'camera', label: 'camera' },
  { kind: 'audiooutput', deviceId: 'default', label: 'default' },
  { kind: 'audiooutput', deviceId: 'headphones', label: 'headphones' },
];

describe('initial devices for lobby, claim-picker and community-call rooms', () => {
  it('reads all saved choices before a room starts and freezes its options during the visit', async () => {
    rememberMediaDevice('audioinput', 'usb-mic');
    rememberMediaDevice('videoinput', 'camera');
    rememberMediaDevice('audiooutput', 'headphones');
    mocks.enumerate.mockResolvedValue(list);
    const { result, rerender, unmount } = renderHook(() => useInitialMediaDevices());
    expect(result.current.ready).toBe(false);
    await waitFor(() =>
      expect(result.current).toEqual({
        ready: true,
        audioInputId: 'usb-mic',
        videoInputId: 'camera',
        audioOutputId: 'headphones',
      })
    );
    const initial = result.current;
    rememberMediaDevice('audioinput', 'default');
    rerender();
    expect(result.current).toBe(initial);
    unmount();
    const nextVisit = renderHook(() => useInitialMediaDevices());
    await waitFor(() => expect(nextVisit.result.current.audioInputId).toBe('default'));
  });

  it('falls back for missing devices without replacing the saved choices', async () => {
    rememberMediaDevice('audioinput', 'missing-mic');
    rememberMediaDevice('videoinput', 'missing-camera');
    rememberMediaDevice('audiooutput', 'missing-speaker');
    mocks.enumerate.mockResolvedValue(list);
    const { result, unmount } = renderHook(() => useInitialMediaDevices());
    await waitFor(() =>
      expect(result.current).toEqual({
        ready: true,
        audioInputId: 'default',
        videoInputId: 'camera',
        audioOutputId: 'default',
      })
    );
    unmount();
    mocks.enumerate.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'missing-mic', label: 'missing-mic' },
      { kind: 'videoinput', deviceId: 'missing-camera', label: 'missing-camera' },
      { kind: 'audiooutput', deviceId: 'missing-speaker', label: 'missing-speaker' },
    ]);
    const returned = renderHook(() => useInitialMediaDevices());
    await waitFor(() =>
      expect(returned.result.current).toEqual({
        ready: true,
        audioInputId: 'missing-mic',
        videoInputId: 'missing-camera',
        audioOutputId: 'missing-speaker',
      })
    );
  });

  it('retains a remembered input when only a redacted default device is exposed before permission', async () => {
    rememberMediaDevice('audioinput', 'usb-mic');
    rememberMediaDevice('videoinput', 'usb-camera');
    mocks.enumerate.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default', label: '' },
      { kind: 'videoinput', deviceId: 'default', label: '' },
    ]);
    const { result } = renderHook(() => useInitialMediaDevices());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.audioInputId).toBe('usb-mic');
    expect(result.current.videoInputId).toBe('usb-camera');
  });

  it.each([{ outputs: [] }, { outputs: [{ kind: 'audiooutput', deviceId: 'default', label: '' }] }])(
    'retains the saved speaker when outputs are hidden before permission: $outputs',
    async ({ outputs }) => {
      rememberMediaDevice('audiooutput', 'headphones');
      mocks.enumerate.mockResolvedValue(outputs);
      const { result } = renderHook(() => useInitialMediaDevices());
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.audioOutputId).toBe('headphones');
    }
  );

  it('keeps capture usable with hidden inputs and disables unsupported speaker routing', async () => {
    rememberMediaDevice('audioinput', 'usb-mic');
    rememberMediaDevice('audiooutput', 'headphones');
    mocks.enumerate.mockRejectedValue(new Error('Unavailable'));
    mocks.supportsOutput.mockReturnValue(false);
    const { result } = renderHook(() => useInitialMediaDevices());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.audioInputId).toBe('usb-mic');
    expect(result.current.audioOutputId).toBeUndefined();
  });
});

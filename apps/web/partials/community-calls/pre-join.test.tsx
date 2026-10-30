import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMediaDevicePreference, rememberMediaDevice } from '~/core/media/device-preferences';

import { PreJoin } from './pre-join';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), enumerate: vi.fn(), listeners: new Map<string, () => void>() }));
vi.mock('@livekit/components-react', () => ({ usePreviewTracks: mocks.preview }));
vi.mock('~/design-system/select', () => ({
  Select: ({
    value,
    options,
    placeholder,
    onChange,
  }: {
    value?: string;
    options: { value: string; label: string }[];
    placeholder: string;
    onChange: (id: string) => void;
  }) => (
    <select aria-label={placeholder} value={value ?? ''} onChange={event => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const devices = [
  { kind: 'audioinput', deviceId: 'default', label: 'Default microphone' },
  { kind: 'audioinput', deviceId: 'usb-mic', label: 'USB microphone' },
  { kind: 'videoinput', deviceId: 'camera', label: 'Default camera' },
  { kind: 'videoinput', deviceId: 'usb-camera', label: 'USB camera' },
];
beforeEach(() => {
  window.localStorage.clear();
  mocks.preview.mockReset().mockReturnValue(undefined);
  mocks.enumerate.mockReset().mockResolvedValue(devices);
  mocks.listeners.clear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: mocks.enumerate,
      addEventListener: (event: string, listener: () => void) => mocks.listeners.set(event, listener),
      removeEventListener: (event: string) => mocks.listeners.delete(event),
    },
  });
});
afterEach(cleanup);

function mockSuccessfulPreview() {
  const cache = new Map<string, unknown[]>();
  mocks.preview.mockImplementation(
    (options: {
      audio: boolean | { deviceId: { ideal: string } };
      video: boolean | { deviceId: { ideal: string } };
    }) => {
      const key = JSON.stringify(options);
      if (!cache.has(key)) {
        cache.set(
          key,
          (['audio', 'video'] as const).flatMap(kind => {
            const option = options[kind];
            if (!option) return [];
            const deviceId =
              typeof option === 'object' ? option.deviceId.ideal : kind === 'audio' ? 'default' : 'camera';
            return [
              { kind, mediaStreamTrack: { getSettings: () => ({ deviceId }) }, attach: vi.fn(), detach: vi.fn() },
            ];
          })
        );
      }
      return cache.get(key);
    }
  );
}

const occurrence = { startMs: 1_792_512_000_000, endMs: 1_792_515_600_000 };

describe('community-call device choices', () => {
  it('uses debate preferences for preview, saves picks, and hands the effective devices into the call', async () => {
    mockSuccessfulPreview();
    rememberMediaDevice('audioinput', 'usb-mic');
    rememberMediaDevice('videoinput', 'usb-camera');
    const onJoin = vi.fn();
    render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={onJoin} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('usb-camera'));
    expect(mocks.preview).toHaveBeenLastCalledWith(
      { audio: false, video: { deviceId: { ideal: 'usb-camera' } } },
      expect.any(Function)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Audio off' }));
    expect(mocks.preview).toHaveBeenLastCalledWith(
      { audio: { deviceId: { ideal: 'usb-mic' } }, video: { deviceId: { ideal: 'usb-camera' } } },
      expect.any(Function)
    );
    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'default' } });
    fireEvent.change(screen.getByLabelText('Camera'), { target: { value: 'camera' } });
    expect(readMediaDevicePreference('audioinput')).toBe('default');
    expect(readMediaDevicePreference('videoinput')).toBe('camera');
    fireEvent.click(screen.getByRole('button', { name: 'Join community call' }));
    expect(onJoin).toHaveBeenCalledWith({
      audioEnabled: true,
      videoEnabled: true,
      audioDeviceId: 'default',
      videoDeviceId: 'camera',
    });
  });

  it('can explicitly remember current fallbacks when the saved inputs are disconnected', async () => {
    mockSuccessfulPreview();
    rememberMediaDevice('audioinput', 'disconnected-mic');
    rememberMediaDevice('videoinput', 'disconnected-camera');
    const view = render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('camera'));
    expect(readMediaDevicePreference('audioinput')).toBe('disconnected-mic');
    expect(readMediaDevicePreference('videoinput')).toBe('disconnected-camera');
    fireEvent.click(await screen.findByRole('button', { name: 'Remember current devices' }));
    expect(readMediaDevicePreference('audioinput')).toBe('default');
    expect(readMediaDevicePreference('videoinput')).toBe('camera');
    view.unmount();
    mocks.enumerate.mockResolvedValue([
      ...devices,
      { kind: 'audioinput', deviceId: 'disconnected-mic', label: 'Returned mic' },
      { kind: 'videoinput', deviceId: 'disconnected-camera', label: 'Returned camera' },
    ]);
    render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('camera'));
    expect(screen.getByLabelText('Microphone')).toHaveValue('default');
  });

  it.each([
    { kind: 'audioinput' as const, label: 'Microphone', id: 'usb-mic' },
    { kind: 'videoinput' as const, label: 'Camera', id: 'usb-camera' },
  ])('can confirm the current $kind after its saved preference is cleared', async ({ kind, label, id }) => {
    mockSuccessfulPreview();
    rememberMediaDevice(kind, id);
    render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(label)).toHaveValue(id));
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(readMediaDevicePreference(kind)).toBeUndefined();
    fireEvent.click(await screen.findByRole('button', { name: 'Remember current devices' }));
    expect(readMediaDevicePreference(kind)).toBe(id);
  });

  it.each([
    { kind: 'audioinput' as const, label: 'Microphone', id: 'usb-mic', trackKind: 'audio', oldId: 'default' },
    { kind: 'videoinput' as const, label: 'Camera', id: 'usb-camera', trackKind: 'video', oldId: 'camera' },
  ])(
    'preserves the saved $kind when a new preview capture fails and saves a successful retry',
    async ({ kind, label, id, trackKind, oldId }) => {
      rememberMediaDevice(kind, oldId);
      const oldTrack = {
        kind: trackKind,
        mediaStreamTrack: { getSettings: () => ({ deviceId: oldId }) },
        attach: vi.fn(),
        detach: vi.fn(),
      };
      mocks.preview.mockReturnValue([oldTrack]);
      const view = render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
      await waitFor(() => expect(screen.getByLabelText(label)).toHaveValue(oldId));
      if (kind === 'audioinput') fireEvent.click(screen.getByRole('button', { name: 'Audio off' }));
      fireEvent.change(screen.getByLabelText(label), { target: { value: id } });
      expect(readMediaDevicePreference(kind)).toBe(oldId);
      act(() => mocks.preview.mock.lastCall?.[1](new Error('Device unavailable')));
      expect(readMediaDevicePreference(kind)).toBe(oldId);
      expect(screen.getByLabelText(label)).toHaveValue(oldId);
      fireEvent.click(screen.getByRole('button', { name: kind === 'audioinput' ? 'Audio off' : 'Video off' }));
      fireEvent.change(screen.getByLabelText(label), { target: { value: id } });
      expect(readMediaDevicePreference(kind)).toBe(oldId);
      const newTrack = { ...oldTrack, mediaStreamTrack: { getSettings: () => ({ deviceId: id }) } };
      mocks.preview.mockReturnValue([newTrack]);
      view.rerender(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
      await waitFor(() => expect(readMediaDevicePreference(kind)).toBe(id));
    }
  );

  it('does not save an unavailable camera when preview substitutes the default device', async () => {
    rememberMediaDevice('videoinput', 'usb-camera');
    mocks.enumerate.mockResolvedValue([
      ...devices,
      { kind: 'videoinput', deviceId: 'other-camera', label: 'Other camera' },
    ]);
    const track = (id: string) => ({
      kind: 'video',
      mediaStreamTrack: { getSettings: () => ({ deviceId: id }) },
      attach: vi.fn(),
      detach: vi.fn(),
    });
    mocks.preview.mockReturnValue([track('usb-camera')]);
    const view = render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('usb-camera'));
    fireEvent.change(screen.getByLabelText('Camera'), { target: { value: 'camera' } });
    mocks.preview.mockReturnValue([track('other-camera')]);
    view.rerender(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('other-camera'));
    await act(async () => mocks.listeners.get('devicechange')?.());
    expect(screen.getByLabelText('Camera')).toHaveValue('other-camera');
    expect(readMediaDevicePreference('videoinput')).toBe('usb-camera');
  });

  it('does not follow preferences from another surface on devicechange during preview', async () => {
    rememberMediaDevice('audioinput', 'default');
    rememberMediaDevice('videoinput', 'camera');
    mocks.enumerate.mockResolvedValue(devices.filter(device => !device.deviceId.startsWith('usb-')));
    render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('camera'));
    act(() => {
      rememberMediaDevice('audioinput', 'usb-mic');
      rememberMediaDevice('videoinput', 'usb-camera');
    });
    mocks.enumerate.mockResolvedValue(devices);
    await act(async () => mocks.listeners.get('devicechange')?.());
    expect(screen.getByLabelText('Microphone')).toHaveValue('default');
    expect(screen.getByLabelText('Camera')).toHaveValue('camera');
  });

  it('leaves browser-default capture unchanged after enumeration when nobody has picked a device', async () => {
    render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera').querySelectorAll('option')).toHaveLength(3));
    expect(mocks.preview).toHaveBeenLastCalledWith({ audio: false, video: true }, expect.any(Function));
  });

  it('keeps the preview callback stable across UI updates so LiveKit does not restart capture', async () => {
    const view = render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join community call' })).toBeEnabled());
    const callback = mocks.preview.mock.lastCall?.[1];
    view.rerender(<PreJoin spaceName="Geo" occurrence={occurrence} joining onJoin={vi.fn()} />);
    expect(mocks.preview.mock.lastCall?.[1]).toBe(callback);
    fireEvent.click(screen.getByRole('button', { name: 'Audio off' }));
    expect(mocks.preview.mock.lastCall?.[1]).toBe(callback);
  });

  it('falls back on unplug and restores the choice on reconnect without overwriting it', async () => {
    rememberMediaDevice('videoinput', 'usb-camera');
    render(<PreJoin spaceName="Geo" occurrence={occurrence} joining={false} onJoin={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('usb-camera'));
    mocks.enumerate.mockResolvedValue(devices.filter(device => device.deviceId !== 'usb-camera'));
    await act(async () => mocks.listeners.get('devicechange')?.());
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('camera'));
    expect(readMediaDevicePreference('videoinput')).toBe('usb-camera');
    mocks.enumerate.mockResolvedValue(devices);
    await act(async () => mocks.listeners.get('devicechange')?.());
    await waitFor(() => expect(screen.getByLabelText('Camera')).toHaveValue('usb-camera'));
  });
});

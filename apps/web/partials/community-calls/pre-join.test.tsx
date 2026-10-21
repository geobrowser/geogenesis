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

const occurrence = { startMs: 1_792_512_000_000, endMs: 1_792_515_600_000 };

describe('community-call device choices', () => {
  it('uses debate preferences for preview, saves picks, and hands the effective devices into the call', async () => {
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

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMediaDevicePreference, rememberMediaDevice } from '~/core/media/device-preferences';

import { CallDeviceMenu } from './call-device-menu';

const mocks = vi.hoisted(() => ({
  switchDevice: vi.fn(),
  authorize: vi.fn(),
  supportsOutput: vi.fn(),
  activeDeviceId: 'default',
}));
vi.mock('livekit-client', () => ({ supportsAudioOutputSelection: mocks.supportsOutput }));
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => ({ switchActiveDevice: mocks.switchDevice }),
  useMediaDeviceSelect: ({ kind }: { kind: MediaDeviceKind }) => ({
    devices: [
      { kind, deviceId: 'default', groupId: 'default', label: 'System default' },
      { kind, deviceId: 'usb-device', groupId: 'usb', label: 'USB device' },
    ],
    activeDeviceId: mocks.activeDeviceId,
  }),
}));
beforeEach(() => {
  window.localStorage.clear();
  mocks.activeDeviceId = 'default';
  mocks.switchDevice.mockReset().mockResolvedValue(true);
  mocks.authorize.mockReset().mockResolvedValue({ deviceId: 'usb-device' });
  mocks.supportsOutput.mockReset().mockReturnValue(true);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { selectAudioOutput: mocks.authorize },
  });
});
afterEach(cleanup);

const chooseUsb = () => {
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('radio', { name: 'USB device' }));
};

describe('in-call device pickers', () => {
  it.each(['audioinput', 'videoinput', 'audiooutput'] as const)(
    'saves explicit %s picks for other surfaces',
    async kind => {
      render(<CallDeviceMenu kind={kind} />);
      chooseUsb();
      await waitFor(() => expect(readMediaDevicePreference(kind)).toBe('usb-device'));
      expect(mocks.switchDevice).toHaveBeenCalledWith(kind, 'usb-device');
      expect(mocks.authorize).toHaveBeenCalledTimes(kind === 'audiooutput' ? 1 : 0);
    }
  );

  it.each(['audioinput', 'videoinput', 'audiooutput'] as const)(
    'can remember the already-selected %s fallback',
    async kind => {
      rememberMediaDevice(kind, 'disconnected-device');
      render(<CallDeviceMenu kind={kind} />);
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('radio', { name: 'System default' }));
      await waitFor(() => expect(readMediaDevicePreference(kind)).toBe('default'));
    }
  );

  it.each(['audioinput', 'videoinput', 'audiooutput'] as const)(
    'saves a first explicit confirmation of the active physical %s',
    async kind => {
      mocks.activeDeviceId = 'usb-device';
      render(<CallDeviceMenu kind={kind} />);
      chooseUsb();
      await waitFor(() => expect(readMediaDevicePreference(kind)).toBe('usb-device'));
      expect(mocks.switchDevice).toHaveBeenCalledExactlyOnceWith(kind, 'usb-device');
    }
  );

  it.each(['rejects', 'returns false'])('does not save a fallback or failed switch when LiveKit %s', async failure => {
    rememberMediaDevice('audiooutput', 'remembered-speaker');
    if (failure === 'rejects') mocks.switchDevice.mockRejectedValue(new Error('Unavailable'));
    else mocks.switchDevice.mockResolvedValue(false);
    render(<CallDeviceMenu kind="audiooutput" />);
    expect(readMediaDevicePreference('audiooutput')).toBe('remembered-speaker');
    chooseUsb();
    await screen.findByRole('alert');
    expect(readMediaDevicePreference('audiooutput')).toBe('remembered-speaker');
  });

  it('routes and remembers the speaker ID returned by browser authorization', async () => {
    mocks.authorize.mockResolvedValue({ deviceId: 'authorized-speaker' });
    render(<CallDeviceMenu kind="audiooutput" />);
    chooseUsb();
    await waitFor(() => expect(readMediaDevicePreference('audiooutput')).toBe('authorized-speaker'));
    expect(mocks.authorize).toHaveBeenCalledWith({ deviceId: 'usb-device' });
    expect(mocks.switchDevice).toHaveBeenCalledWith('audiooutput', 'authorized-speaker');
  });

  it('keeps the existing speaker when browser authorization is denied', async () => {
    rememberMediaDevice('audiooutput', 'remembered-speaker');
    mocks.authorize.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    render(<CallDeviceMenu kind="audiooutput" />);
    chooseUsb();
    await screen.findByRole('alert');
    expect(mocks.switchDevice).not.toHaveBeenCalled();
    expect(readMediaDevicePreference('audiooutput')).toBe('remembered-speaker');
  });

  it('shows the disabled system default when speaker routing is unsupported', () => {
    mocks.supportsOutput.mockReturnValue(false);
    render(<CallDeviceMenu kind="audiooutput" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('radio', { name: 'System default' })).toBeDisabled();
    expect(screen.queryByRole('radio', { name: 'USB device' })).not.toBeInTheDocument();
    expect(mocks.switchDevice).not.toHaveBeenCalled();
  });

  it('remembers an explicit system-default input even when the track reports its physical device ID', async () => {
    mocks.activeDeviceId = 'usb-device';
    mocks.switchDevice.mockResolvedValue(false);
    render(<CallDeviceMenu kind="audioinput" />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('radio', { name: 'System default' }));
    await waitFor(() => expect(readMediaDevicePreference('audioinput')).toBe('default'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('locks the picker until the pending switch finishes', async () => {
    let finish!: (success: boolean) => void;
    mocks.switchDevice.mockReturnValue(
      new Promise<boolean>(resolve => {
        finish = resolve;
      })
    );
    render(<CallDeviceMenu kind="audioinput" />);
    chooseUsb();
    expect(screen.getByRole('radio', { name: 'USB device' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'System default' })).toBeDisabled();
    finish(true);
    await waitFor(() => expect(readMediaDevicePreference('audioinput')).toBe('usb-device'));
  });
});

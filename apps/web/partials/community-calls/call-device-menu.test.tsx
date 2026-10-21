import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMediaDevicePreference, rememberMediaDevice } from '~/core/media/device-preferences';

import { CallDeviceMenu } from './call-device-menu';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => ({}),
  useMediaDeviceSelect: () => ({
    devices: [
      { deviceId: 'default', label: 'System default' },
      { deviceId: 'usb-device', label: 'USB device' },
    ],
    activeDeviceId: 'default',
    setActiveMediaDevice: mocks.select,
  }),
}));
beforeEach(() => {
  window.localStorage.clear();
  mocks.select.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('in-call device pickers', () => {
  it.each(['audioinput', 'videoinput', 'audiooutput'] as const)(
    'saves explicit %s picks for other surfaces',
    async kind => {
      render(<CallDeviceMenu kind={kind} />);
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button', { name: 'USB device' }));
      await waitFor(() => expect(readMediaDevicePreference(kind)).toBe('usb-device'));
      expect(mocks.select).toHaveBeenCalledWith('usb-device');
    }
  );

  it('does not save automatic fallback devices or a failed switch', async () => {
    rememberMediaDevice('audiooutput', 'remembered-speaker');
    mocks.select.mockRejectedValue(new Error('Unavailable'));
    render(<CallDeviceMenu kind="audiooutput" />);
    expect(readMediaDevicePreference('audiooutput')).toBe('remembered-speaker');
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'USB device' }));
    await screen.findByRole('alert');
    expect(readMediaDevicePreference('audiooutput')).toBe('remembered-speaker');
  });
});

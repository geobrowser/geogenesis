'use client';

import { useMediaDeviceSelect, useRoomContext } from '@livekit/components-react';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { rememberMediaDevice } from '~/core/media/device-preferences';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

/** Save explicit selections only: LiveKit's active-device callbacks also fire for fallbacks. */
export function CallDeviceMenu({ kind }: { kind: MediaDeviceKind }) {
  const room = useRoomContext();
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    room,
    requestPermissions: false,
  });
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState(false);
  const label = kind === 'audioinput' ? 'Microphone' : kind === 'videoinput' ? 'Camera' : 'Speaker';
  const select = async (id: string) => {
    setError(false);
    try {
      await setActiveMediaDevice(id);
      rememberMediaDevice(kind, id);
      setOpen(false);
    } catch {
      setError(true);
    }
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="lk-button lk-button-menu" aria-label={`Select ${label.toLowerCase()}`}>
          {kind === 'audiooutput' && 'Speaker'}
          <ChevronDownSmall />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          className="z-[1011] max-h-64 w-64 overflow-y-auto rounded-lg border border-grey-02 bg-white p-2 text-text shadow-lg"
        >
          <p className="px-2 py-1 text-metadataMedium">{label}</p>
          {devices.length === 0 && <p className="p-2 text-metadata text-grey-04">System default</p>}
          {devices.map((device, index) => (
            <button
              key={device.deviceId}
              type="button"
              aria-pressed={device.deviceId === activeDeviceId}
              onClick={() => void select(device.deviceId)}
              className="block w-full rounded p-2 text-left text-metadata hover:bg-grey-01 aria-pressed:bg-grey-01"
            >
              {device.label || `${label} ${index + 1}`}
            </button>
          ))}
          {error && (
            <p role="alert" className="p-2 text-metadata text-red-01">
              Could not switch devices. Try another device.
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

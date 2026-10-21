'use client';

import { useMediaDeviceSelect, useRoomContext } from '@livekit/components-react';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { supportsAudioOutputSelection } from 'livekit-client';

import { DeviceOptionGroup } from '~/core/debates/device-option-group';
import {
  authorizeAudioOutput,
  mediaDeviceLabels,
  systemDefaultAudioOutput,
  toMediaDeviceOptions,
} from '~/core/media/device-options';
import { rememberMediaDevice } from '~/core/media/device-preferences';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

/** Save explicit selections only: LiveKit's active-device callbacks also fire for fallbacks. */
export function CallDeviceMenu({ kind }: { kind: MediaDeviceKind }) {
  const room = useRoomContext();
  const { devices, activeDeviceId } = useMediaDeviceSelect({ kind, room, requestPermissions: false });
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);
  const supported = kind !== 'audiooutput' || (supportsAudioOutputSelection() && devices.length > 0);
  const label = mediaDeviceLabels[kind];
  const select = async (id: string) => {
    if (busy || !supported) return;
    setBusy(true);
    setError(false);
    try {
      const authorized = kind === 'audiooutput' ? await authorizeAudioOutput(id) : undefined;
      const selectedId = authorized?.deviceId ?? id;
      // The selector hook drops the result. An unavailable concrete device must not be saved.
      // A default input can return false because getSettings reports its physical ID instead of
      // the 'default' alias; a rejected request still reaches the catch below.
      const switched = await room.switchActiveDevice(kind, selectedId);
      if (!switched && selectedId !== systemDefaultAudioOutput.deviceId) throw new Error('Device switch failed');
      rememberMediaDevice(kind, selectedId);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
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
          <DeviceOptionGroup
            label={`Select a ${label.toLowerCase()}`}
            options={
              supported ? toMediaDeviceOptions(devices.filter(device => device.deviceId)) : [systemDefaultAudioOutput]
            }
            selectedDeviceId={supported ? activeDeviceId : systemDefaultAudioOutput.deviceId}
            disabled={busy || !supported}
            onChange={id => void select(id)}
          />
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

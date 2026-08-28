'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import { type MediaDeviceOption, systemDefaultAudioOutput } from '~/core/debates/media-session';

import { Text } from '~/design-system/text';

import { CloseIcon } from './debate-room-controls';
import { DeviceOptionGroup } from './device-option-group';

/**
 * The microphone + speaker chooser shared by every surface that hands the user their audio devices:
 * the debate pre-join screen and the claim-exploration voice dock. They render the same list on
 * purpose — a device picked in one carries into the other through the shared media session.
 */
export function AudioSettings({
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputId,
  selectedAudioOutputId,
  audioOutputSupported,
  error,
  framed = false,
  onAudioInputChange,
  onAudioOutputChange,
}: {
  audioInputDevices: MediaDeviceOption[];
  audioOutputDevices: MediaDeviceOption[];
  selectedAudioInputId: string;
  selectedAudioOutputId: string;
  audioOutputSupported: boolean;
  error: string | null;
  framed?: boolean;
  onAudioInputChange: (deviceId: string) => void;
  onAudioOutputChange: (deviceId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <DeviceOptionGroup
        label="Select a microphone"
        options={audioInputDevices}
        selectedDeviceId={selectedAudioInputId}
        framed={framed}
        onChange={onAudioInputChange}
      />
      <div className={framed ? undefined : 'border-t border-grey-02 pt-3'}>
        <DeviceOptionGroup
          label="Select a speaker"
          options={audioOutputSupported ? audioOutputDevices : [systemDefaultAudioOutput]}
          selectedDeviceId={audioOutputSupported ? selectedAudioOutputId : systemDefaultAudioOutput.deviceId}
          disabled={!audioOutputSupported}
          framed={framed}
          onChange={onAudioOutputChange}
        />
      </div>
      {error && (
        <Text as="p" variant="metadata" color="red-01">
          {error}
        </Text>
      )}
    </div>
  );
}

/** Bottom sheet the mobile layouts open instead of a popover. */
export function MobileSettingsSheet({
  title,
  open,
  onOpenChange,
  returnFocusRef,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1010] bg-black/55" />
        <Dialog.Content
          aria-label={title}
          data-layout="bottom-sheet"
          onCloseAutoFocus={event => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          className="rounded-t-2xl fixed inset-x-0 bottom-0 z-[1011] max-h-[88dvh] overflow-y-auto bg-white px-5 pt-5 pb-[max(24px,env(safe-area-inset-bottom))] text-left text-text shadow-lg outline-none"
        >
          <div className="flex items-center justify-between border-b border-grey-02 pb-4">
            <Dialog.Title className="text-bodySemibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={`Close ${title}`}
                className="grid size-8 place-items-center rounded-full text-grey-04 hover:bg-grey-01 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-text"
              >
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
          <div className="pt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

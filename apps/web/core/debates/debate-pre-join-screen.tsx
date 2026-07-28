'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as RadioGroup from '@radix-ui/react-radio-group';

import * as React from 'react';

import cx from 'classnames';

import { useIsMobileCallLayout } from '~/core/community-calls/use-is-mobile-call-layout';
import type { DebateParticipantSummary, ParticipantSlot } from '~/core/debates/api';
import { type MediaDeviceOption, type PreJoinMediaState, systemDefaultAudioOutput } from '~/core/debates/media-session';

import { Avatar } from '~/design-system/avatar';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { CameraIcon, CloseIcon, LeaveIcon, MicrophoneIcon, RecordingCircleButton } from './debate-room-controls';

export type DebatePreScreenParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
};

export function DebatePreScreen({
  claim,
  participants,
  currentUserId,
  localReady,
  remoteReady,
  localVideoRef,
  previewStream,
  previewState,
  previewBusy,
  error,
  audioInputDevices,
  audioOutputDevices,
  videoInputDevices,
  selectedAudioInputId,
  selectedAudioOutputId,
  selectedVideoInputId,
  audioOutputSupported,
  audioOutputError,
  onAudioInputChange,
  onAudioOutputChange,
  onVideoInputChange,
  onRetryMedia,
  readyBusy,
  onReady,
  onLeave,
  leaveDisabled,
}: {
  claim: string;
  participants: DebatePreScreenParticipant[];
  currentUserId: string | null;
  localReady: boolean;
  remoteReady: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  previewStream: MediaStream | null;
  previewState: PreJoinMediaState;
  previewBusy: boolean;
  error: string | null;
  audioInputDevices: MediaDeviceOption[];
  audioOutputDevices: MediaDeviceOption[];
  videoInputDevices: MediaDeviceOption[];
  selectedAudioInputId: string;
  selectedAudioOutputId: string;
  selectedVideoInputId: string;
  audioOutputSupported: boolean;
  audioOutputError: string | null;
  onAudioInputChange: (deviceId: string) => void;
  onAudioOutputChange: (deviceId: string) => void;
  onVideoInputChange: (deviceId: string) => void;
  onRetryMedia: () => void;
  readyBusy: boolean;
  onReady: () => void;
  onLeave: () => void;
  leaveDisabled: boolean;
}) {
  const isMobile = useIsMobileCallLayout();
  const [openSettings, setOpenSettings] = React.useState<'audio' | 'video' | null>(null);
  const audioTriggerRef = React.useRef<HTMLButtonElement>(null);
  const videoTriggerRef = React.useRef<HTMLButtonElement>(null);
  const sortedParticipants = [...participants].sort((a, b) => a.participant_slot - b.participant_slot);
  const localParticipant =
    sortedParticipants.find(participant => participant.user_id === currentUserId) ?? sortedParticipants[0] ?? null;
  const remoteParticipant =
    sortedParticipants.find(participant => participant.user_id !== localParticipant?.user_id) ??
    sortedParticipants[1] ??
    null;
  const mediaReady = previewState === 'ready';
  const selectedCameraLabel =
    videoInputDevices.find(device => device.deviceId === selectedVideoInputId)?.label ?? 'Camera';

  React.useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocumentOverflow;
    };
  }, []);

  React.useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !mediaReady) return;
    video.srcObject = previewStream;
    video.muted = true;
    if (previewStream) void video.play().catch(() => undefined);
  }, [localVideoRef, mediaReady, previewStream]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Debate readiness"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text"
    >
      <section className="mx-auto flex min-h-dvh w-full max-w-[920px] flex-col items-center justify-center px-5 py-6 text-center md:justify-start">
        <Text as="p" variant="cardEntityTitle" color="grey-04">
          Debate
        </Text>
        <h1 className="mt-3 max-w-[870px] text-[2.5rem] leading-[1.05] font-semibold text-text md:max-w-[560px] md:text-[2rem]">
          {claim}
        </h1>

        <div className="mt-10 w-full max-w-[272px]">
          <PreScreenOpponent
            participant={remoteParticipant}
            label={
              remoteParticipant ? remoteParticipant.display_name || remoteParticipant.profile_space_id : 'Other speaker'
            }
            ready={remoteReady}
          />
        </div>

        {mediaReady ? (
          <div className="mt-3 w-full max-w-[272px] rounded-lg border border-grey-02 bg-white p-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-grey-01">
              <video ref={localVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {isMobile ? (
                <>
                  <PreScreenSettingsTrigger
                    ref={audioTriggerRef}
                    ariaLabel="Audio settings"
                    icon={<MicrophoneIcon muted={false} />}
                    label="Custom combination"
                    open={openSettings === 'audio'}
                    onClick={() => setOpenSettings(current => (current === 'audio' ? null : 'audio'))}
                  />
                  <PreScreenSettingsTrigger
                    ref={videoTriggerRef}
                    ariaLabel="Video settings"
                    icon={<CameraIcon disabled={false} />}
                    label={selectedCameraLabel}
                    open={openSettings === 'video'}
                    onClick={() => setOpenSettings(current => (current === 'video' ? null : 'video'))}
                  />
                </>
              ) : (
                <>
                  <DesktopSettingsPopover
                    ariaLabel="Audio settings"
                    icon={<MicrophoneIcon muted={false} />}
                    label="Custom combination"
                    open={openSettings === 'audio'}
                    onOpenChange={open => setOpenSettings(open ? 'audio' : null)}
                  >
                    <AudioSettings
                      audioInputDevices={audioInputDevices}
                      audioOutputDevices={audioOutputDevices}
                      selectedAudioInputId={selectedAudioInputId}
                      selectedAudioOutputId={selectedAudioOutputId}
                      audioOutputSupported={audioOutputSupported}
                      error={audioOutputError}
                      onAudioInputChange={onAudioInputChange}
                      onAudioOutputChange={onAudioOutputChange}
                    />
                  </DesktopSettingsPopover>
                  <DesktopSettingsPopover
                    ariaLabel="Video settings"
                    icon={<CameraIcon disabled={false} />}
                    label={selectedCameraLabel}
                    open={openSettings === 'video'}
                    onOpenChange={open => setOpenSettings(open ? 'video' : null)}
                  >
                    <DeviceOptionGroup
                      label="Select a camera"
                      options={videoInputDevices}
                      selectedDeviceId={selectedVideoInputId}
                      onChange={onVideoInputChange}
                    />
                  </DesktopSettingsPopover>
                </>
              )}
            </div>
          </div>
        ) : (
          <PreScreenMediaUnavailable state={previewState} message={error} onRetry={onRetryMedia} />
        )}

        {mediaReady && error && (
          <Text as="p" variant="metadata" color="red-01" className="mt-3">
            {error}
          </Text>
        )}

        {mediaReady && (
          <button
            type="button"
            onClick={onReady}
            disabled={readyBusy || localReady || previewBusy}
            className="mt-3 flex min-h-11 w-full max-w-[272px] items-center justify-center rounded-full bg-text px-5 text-button text-white transition-colors hover:bg-text/90 disabled:opacity-50"
          >
            {localReady ? 'Waiting...' : readyBusy ? 'Saving...' : "I'm ready"}
          </button>
        )}

        <div className="mt-5">
          <RecordingCircleButton
            ariaLabel="Leave debate"
            title="Leave debate"
            onClick={onLeave}
            disabled={leaveDisabled}
          >
            <LeaveIcon />
          </RecordingCircleButton>
        </div>
      </section>

      {isMobile && (
        <>
          <MobileSettingsSheet
            title="Audio settings"
            open={openSettings === 'audio'}
            onOpenChange={open => setOpenSettings(open ? 'audio' : null)}
            returnFocusRef={audioTriggerRef}
          >
            <AudioSettings
              audioInputDevices={audioInputDevices}
              audioOutputDevices={audioOutputDevices}
              selectedAudioInputId={selectedAudioInputId}
              selectedAudioOutputId={selectedAudioOutputId}
              audioOutputSupported={audioOutputSupported}
              error={audioOutputError}
              onAudioInputChange={onAudioInputChange}
              onAudioOutputChange={onAudioOutputChange}
            />
          </MobileSettingsSheet>
          <MobileSettingsSheet
            title="Video settings"
            open={openSettings === 'video'}
            onOpenChange={open => setOpenSettings(open ? 'video' : null)}
            returnFocusRef={videoTriggerRef}
          >
            <SharedPreviewVideo stream={previewStream} />
            <div className="mt-5">
              <DeviceOptionGroup
                label="Select a camera"
                options={videoInputDevices}
                selectedDeviceId={selectedVideoInputId}
                onChange={onVideoInputChange}
              />
            </div>
          </MobileSettingsSheet>
        </>
      )}
    </div>
  );
}

type PreScreenSettingsTriggerProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'aria-label'> & {
  ariaLabel: string;
  icon: React.ReactNode;
  label: string;
  open: boolean;
};

const PreScreenSettingsTrigger = React.forwardRef<HTMLButtonElement, PreScreenSettingsTriggerProps>(
  function PreScreenSettingsTrigger({ ariaLabel, icon, label, open, className, ...buttonProps }, forwardedRef) {
    return (
      <button
        {...buttonProps}
        ref={forwardedRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cx(
          'relative flex min-h-9 w-full min-w-0 items-center rounded-full border bg-white px-3 py-2 text-left text-metadata text-text transition outline-none',
          open ? 'border-text ring-1 ring-text' : 'border-grey-02 hover:border-grey-04',
          'focus-visible:border-text focus-visible:ring-1 focus-visible:ring-text',
          className
        )}
      >
        <span className="mr-2 shrink-0 text-text">{icon}</span>
        <span className="min-w-0 flex-1 truncate pr-6">{label}</span>
        <span
          className={cx(
            'pointer-events-none absolute right-3 grid size-4 place-items-center transition-transform',
            open && 'rotate-180'
          )}
        >
          <ChevronDownSmall color={open ? 'text' : 'grey-04'} />
        </span>
      </button>
    );
  }
);

function DesktopSettingsPopover({
  ariaLabel,
  icon,
  label,
  open,
  onOpenChange,
  children,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const elevatedPopoverPortal = useElevatedPopoverPortal();

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <PreScreenSettingsTrigger ref={triggerRef} ariaLabel={ariaLabel} icon={icon} label={label} open={open} />
      </Popover.Trigger>
      {/* The default Radix wrapper is globally capped at z-60, below this screen's z-1000 overlay. */}
      {elevatedPopoverPortal && (
        <Popover.Portal container={elevatedPopoverPortal}>
          <Popover.Content
            role="dialog"
            aria-label={ariaLabel}
            side="top"
            align="start"
            sideOffset={-1}
            avoidCollisions={false}
            onCloseAutoFocus={event => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
            className="z-[1010] max-h-[360px] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border border-grey-02 bg-white p-2 text-left text-text shadow-lg outline-none"
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}

function MobileSettingsSheet({
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

function AudioSettings({
  audioInputDevices,
  audioOutputDevices,
  selectedAudioInputId,
  selectedAudioOutputId,
  audioOutputSupported,
  error,
  onAudioInputChange,
  onAudioOutputChange,
}: {
  audioInputDevices: MediaDeviceOption[];
  audioOutputDevices: MediaDeviceOption[];
  selectedAudioInputId: string;
  selectedAudioOutputId: string;
  audioOutputSupported: boolean;
  error: string | null;
  onAudioInputChange: (deviceId: string) => void;
  onAudioOutputChange: (deviceId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <DeviceOptionGroup
        label="Select a microphone"
        options={audioInputDevices}
        selectedDeviceId={selectedAudioInputId}
        onChange={onAudioInputChange}
      />
      <div className="border-t border-grey-02 pt-3">
        <DeviceOptionGroup
          label="Select a speaker"
          options={audioOutputSupported ? audioOutputDevices : [systemDefaultAudioOutput]}
          selectedDeviceId={audioOutputSupported ? selectedAudioOutputId : systemDefaultAudioOutput.deviceId}
          disabled={!audioOutputSupported}
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

function DeviceOptionGroup({
  label,
  options,
  selectedDeviceId,
  disabled = false,
  onChange,
}: {
  label: string;
  options: MediaDeviceOption[];
  selectedDeviceId: string;
  disabled?: boolean;
  onChange: (deviceId: string) => void;
}) {
  return (
    <RadioGroup.Root aria-label={label} value={selectedDeviceId} disabled={disabled} onValueChange={onChange}>
      <Text as="p" variant="metadata" color="grey-04" className="px-1 pb-1">
        {label}
      </Text>
      <div className="space-y-0.5">
        {options.map(device => {
          const selected = device.deviceId === selectedDeviceId;
          return (
            <RadioGroup.Item
              key={`${device.kind}:${device.deviceId}`}
              value={device.deviceId}
              className={cx(
                'flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-metadata text-text outline-none',
                selected ? 'bg-grey-01' : 'hover:bg-grey-01',
                'focus-visible:ring-1 focus-visible:ring-text disabled:cursor-default disabled:opacity-100'
              )}
            >
              <span className="min-w-0 truncate">{device.label}</span>
              {selected && (
                <span aria-hidden="true" className="shrink-0">
                  <Check />
                </span>
              )}
            </RadioGroup.Item>
          );
        })}
      </div>
    </RadioGroup.Root>
  );
}

function SharedPreviewVideo({ stream }: { stream: MediaStream | null }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-grey-01">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
    </div>
  );
}

function PreScreenMediaUnavailable({
  state,
  message,
  onRetry,
}: {
  state: Exclude<PreJoinMediaState, 'ready'>;
  message: string | null;
  onRetry: () => void;
}) {
  const requesting = state === 'requesting';
  return (
    <div className="mt-3 w-full max-w-[272px] rounded-lg border border-grey-02 bg-white p-3">
      <div className="grid aspect-[4/3] w-full place-items-center rounded bg-grey-01 text-grey-04">
        <CameraIcon disabled />
      </div>
      <Text as="p" variant="metadata" color="text" className="mx-auto mt-3 max-w-[220px]">
        {requesting ? 'Requesting access to your camera and microphone…' : message}
      </Text>
      {!requesting && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-8 items-center justify-center rounded-full bg-text px-4 text-button text-white hover:bg-text/90"
        >
          {state === 'denied' ? 'Allow access' : 'Try again'}
        </button>
      )}
    </div>
  );
}

function PreScreenOpponent({
  participant,
  label,
  ready,
}: {
  participant: DebatePreScreenParticipant | null;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex min-h-[52px] w-full items-center justify-between gap-4 rounded-lg border border-grey-02 bg-white px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={participant?.avatar_cid ?? null}
            value={participant?.profile_space_id ?? label}
            alt={label}
            size={20}
          />
        </span>
        <Text as="div" variant="metadata" color="text" className="min-w-0 truncate text-left">
          {label}
        </Text>
      </div>
      <span
        className={cx(
          'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-metadata leading-none',
          ready ? 'bg-green text-text' : 'bg-grey-01 text-grey-04'
        )}
      >
        {ready && <Check />}
        {ready ? 'Ready' : 'Waiting...'}
      </span>
    </div>
  );
}

'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useIsMobileCallLayout } from '~/core/community-calls/use-is-mobile-call-layout';
import type { DebateParticipant } from '~/core/debates/api';
import type { MediaDeviceOption, PreJoinMediaState } from '~/core/debates/media-session';

import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { AudioSettings, MobileSettingsSheet } from './audio-settings';
import { DebateRecordingStatusPill } from './debate-recording-status-pill';
import { CameraIcon, LeaveIcon, MicrophoneIcon, RecordingCircleButton } from './debate-room-controls';
import { DebateVideoTile } from './debate-video-tile';
import { DeviceOptionGroup } from './device-option-group';
import { MicrophoneLevelMeter } from './microphone-level-meter';
import { useScrollLock } from './use-scroll-lock';

export type DebatePreScreenRemotePresence = 'absent' | 'present' | 'left';

/**
 * The pre-debate screen: a live two-way call from the moment both sides grant the camera, ending
 * when both press ready. Nothing here is recorded.
 *
 * Shares the room's tile, ordering and geometry so crossing into the debate changes the chrome
 * rather than the layout.
 */
export function DebatePreScreen({
  claim,
  participants,
  currentUserId,
  localReady,
  remoteReady,
  setLocalVideoElement,
  setRemoteMediaElement,
  remoteVideoReady,
  remotePresence,
  capturing,
  previewStream,
  previewState,
  previewBusy,
  switchingDevice,
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
  devicesLocked,
  connectionSettling,
  mediaError,
  canRetryConnection,
  onRetryConnection,
  canTakeOverConnection,
  onTakeOverConnection,
  readyBusy,
  onReady,
  onLeave,
  leaveDisabled,
}: {
  claim: string;
  participants: DebateParticipant[];
  currentUserId: string | null;
  localReady: boolean;
  remoteReady: boolean;
  setLocalVideoElement: (video: HTMLVideoElement | null) => void;
  setRemoteMediaElement: (host: HTMLDivElement | null) => void;
  remoteVideoReady: boolean;
  remotePresence: DebatePreScreenRemotePresence;
  capturing: boolean;
  previewStream: MediaStream | null;
  previewState: PreJoinMediaState;
  previewBusy: boolean;
  /** A camera or microphone swap is in flight, so the tile has no stream to show meanwhile. */
  switchingDevice: boolean;
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
  /**
   * A connection is in flight. Swapping a device restarts the preview, which stops the very tracks
   * that connection is in the middle of publishing — the reconnect effect only covers a swap once
   * the room is already up, so the pickers close for the moment it takes to settle.
   */
  devicesLocked: boolean;
  /**
   * A connection is mid-handshake. Readiness is held back until it settles: the second ready
   * starts the server's connecting deadline, and starting it from a half-open room spends that
   * window on a handshake already in progress. A failed connection deliberately does not block
   * readiness, because the connecting phase exists to get both sides into the room and would
   * otherwise leave a debate unstartable whenever the intro could not connect.
   */
  connectionSettling: boolean;
  /** Why the camera or microphone is unavailable, as distinct from a room-connection failure. */
  mediaError: string | null;
  canRetryConnection: boolean;
  onRetryConnection: () => void;
  /** Another tab or device holds this debate and this one can claim it back. */
  canTakeOverConnection: boolean;
  onTakeOverConnection: () => void;
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
  const remoteName = remoteParticipant
    ? remoteParticipant.display_name || remoteParticipant.profile_space_id
    : 'the other speaker';
  const mediaReady = previewState === 'ready';
  const selectedCameraLabel =
    videoInputDevices.find(device => device.deviceId === selectedVideoInputId)?.label ?? 'Camera';

  useScrollLock();

  // Closing, not just disabling the trigger: an open popover or sheet keeps its radios clickable,
  // and picking one there restarts the preview underneath the connection that is publishing it.
  React.useEffect(() => {
    if (devicesLocked) setOpenSettings(null);
  }, [devicesLocked]);

  // The intro and the debate room are two `aria-modal` dialogs that replace each other, and the
  // swap is triggered by the *other* participant — so without this, focus silently falls to
  // `body` at the moment the recorded debate begins.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => dialogRef.current?.focus(), []);

  const localTile = (
    <DebateVideoTile
      key="local"
      participantPosition={localParticipant?.position ?? null}
      positionLabel={localParticipant?.position_label ?? null}
      active={false}
      // Permission is reported inside the tile, not in place of the layout: replacing the screen
      // hid the opponent and their readiness from whoever was slowest to grant.
      overlayText={
        mediaReady
          ? switchingDevice
            ? 'Switching device…'
            : null
          : previewState === 'requesting'
            ? 'Requesting camera and mic…'
            : mediaError
      }
      // Everything the unready states say is a sentence rather than a label.
      overlayCompact={!mediaReady || switchingDevice}
      inactiveIndicatorId="local"
      tileLabel="You"
      badge={localReady ? <PreScreenReadyBadge /> : null}
    >
      <video ref={setLocalVideoElement} className="h-full w-full bg-grey-01 object-cover" playsInline muted autoPlay />
    </DebateVideoTile>
  );

  const remoteTile = (
    <DebateVideoTile
      key="remote"
      participantPosition={remoteParticipant?.position ?? null}
      positionLabel={remoteParticipant?.position_label ?? null}
      active={false}
      // Presence and video are separate facts: not yet granted reads very differently from
      // someone who was here and left.
      overlayText={
        remotePresence === 'left'
          ? `${remoteName} left the room.`
          : remotePresence === 'absent'
            ? `Waiting for ${remoteName} to join…`
            : !remoteVideoReady
              ? 'Waiting for video'
              : null
      }
      overlayCompact={remotePresence !== 'present'}
      inactiveIndicatorId="remote"
      tileLabel={remoteName}
      badge={remoteReady ? <PreScreenReadyBadge /> : null}
    >
      <div
        ref={setRemoteMediaElement}
        className="h-full w-full bg-grey-01 [&>audio]:hidden [&>video]:h-full [&>video]:w-full [&>video]:bg-grey-01 [&>video]:object-cover"
      />
    </DebateVideoTile>
  );

  // The room's ordering rule, so neither tile moves when the debate starts.
  const orderedTiles = localParticipant?.position === false ? [remoteTile, localTile] : [localTile, remoteTile];

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Debate readiness"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text outline-none"
    >
      <DebateRecordingStatusPill recording={capturing} />

      {/* `pt-16` clears the fixed recording pill, which is centred over the top of both screens. */}
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-2 pt-16 pb-8 sm:px-5">
        <h1 className="mb-2 max-w-[390px] text-center text-[1.375rem] leading-[1.1] font-semibold text-text">
          {claim}
        </h1>
        {/* Not "when you are both ready": that moves the debate to `connecting`, and the recorder
            does not start until `preflight` a beat later. */}
        <Text as="p" variant="metadata" color="grey-04" className="mb-5 max-w-[390px] text-center">
          Say hello first. This part isn&apos;t recorded, and recording starts when the debate does.
        </Text>

        <div className="grid w-full gap-2">{orderedTiles}</div>

        {!mediaReady && previewState !== 'requesting' && (
          <button
            type="button"
            onClick={onRetryMedia}
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-text px-4 text-button text-white hover:bg-text/90"
          >
            {previewState === 'denied' ? 'Allow access' : 'Try again'}
          </button>
        )}

        {mediaReady && (
          <div className="mt-3 w-full rounded-lg border border-grey-02 bg-white p-3">
            <div className="flex flex-col gap-[6px]">
              {isMobile ? (
                <>
                  <PreScreenSettingsTrigger
                    ref={audioTriggerRef}
                    ariaLabel="Audio settings"
                    icon={<MicrophoneIcon muted={false} />}
                    label="Custom combination"
                    open={openSettings === 'audio'}
                    disabled={devicesLocked}
                    onClick={() => setOpenSettings(current => (current === 'audio' ? null : 'audio'))}
                  />
                  <PreScreenSettingsTrigger
                    ref={videoTriggerRef}
                    ariaLabel="Video settings"
                    icon={<CameraIcon disabled={false} />}
                    label={selectedCameraLabel}
                    open={openSettings === 'video'}
                    disabled={devicesLocked}
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
                    disabled={devicesLocked}
                    onOpenChange={open => setOpenSettings(open ? 'audio' : null)}
                  >
                    <AudioSettings
                      audioInputDevices={audioInputDevices}
                      audioOutputDevices={audioOutputDevices}
                      selectedAudioInputId={selectedAudioInputId}
                      selectedAudioOutputId={selectedAudioOutputId}
                      audioOutputSupported={audioOutputSupported}
                      error={audioOutputError}
                      devicesLocked={devicesLocked}
                      onAudioInputChange={onAudioInputChange}
                      onAudioOutputChange={onAudioOutputChange}
                    />
                  </DesktopSettingsPopover>
                  <DesktopSettingsPopover
                    ariaLabel="Video settings"
                    icon={<CameraIcon disabled={false} />}
                    label={selectedCameraLabel}
                    open={openSettings === 'video'}
                    disabled={devicesLocked}
                    onOpenChange={open => setOpenSettings(open ? 'video' : null)}
                  >
                    <DeviceOptionGroup
                      label="Select a camera"
                      options={videoInputDevices}
                      selectedDeviceId={selectedVideoInputId}
                      disabled={devicesLocked}
                      onChange={onVideoInputChange}
                    />
                  </DesktopSettingsPopover>
                </>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-grey-02 pt-2">
              <p className="text-[12px] leading-4 font-normal text-grey-04">Speak to test your mic</p>
              <MicrophoneLevelMeter stream={previewStream} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-red-01 bg-white px-4 py-3">
            <Text as="p" variant="metadata" color="red-01">
              {error}
            </Text>
            {(canTakeOverConnection || canRetryConnection) && (
              <button
                type="button"
                onClick={canTakeOverConnection ? onTakeOverConnection : onRetryConnection}
                className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-full bg-text px-4 text-button text-white hover:bg-text/90"
              >
                {canTakeOverConnection ? 'Continue here' : 'Reconnect'}
              </button>
            )}
          </div>
        )}

        {mediaReady && (
          <button
            type="button"
            onClick={onReady}
            disabled={readyBusy || localReady || previewBusy || connectionSettling}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-text px-5 text-button text-white transition-colors hover:bg-text/90 disabled:opacity-50"
          >
            {localReady
              ? `Waiting for ${remoteName}…`
              : connectionSettling
                ? 'Connecting…'
                : readyBusy
                  ? 'Saving...'
                  : remoteReady
                    ? "I'm ready too"
                    : "I'm ready"}
          </button>
        )}

        <div className="mt-5 flex w-full justify-end">
          <RecordingCircleButton
            ariaLabel="Leave debate"
            title="Leave debate"
            onClick={onLeave}
            disabled={leaveDisabled}
          >
            <LeaveIcon />
          </RecordingCircleButton>
        </div>
      </main>

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
              devicesLocked={devicesLocked}
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
                disabled={devicesLocked}
                onChange={onVideoInputChange}
              />
            </div>
          </MobileSettingsSheet>
        </>
      )}
    </div>
  );
}

/** Readiness as a fact on a tile, deliberately not a prompt or countdown near the ready button. */
function PreScreenReadyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green px-3 py-1.5 text-metadata leading-none text-text">
      <Check />
      Ready
    </span>
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
  disabled,
  onOpenChange,
  children,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  label: string;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const elevatedPopoverPortal = useElevatedPopoverPortal();

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <PreScreenSettingsTrigger
          ref={triggerRef}
          ariaLabel={ariaLabel}
          icon={icon}
          label={label}
          open={open}
          disabled={disabled}
        />
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

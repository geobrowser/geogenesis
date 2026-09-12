'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useIsMobileCallLayout } from '~/core/community-calls/use-is-mobile-call-layout';
import type { DebateParticipant } from '~/core/debates/api';
import type { MediaDeviceOption, PreJoinMediaState } from '~/core/debates/media-session';

import { Avatar } from '~/design-system/avatar';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { AudioSettings, MobileSettingsSheet } from './audio-settings';
import { DebateRecordingStatusPill } from './debate-recording-status-pill';
import {
  CameraIcon,
  DebateTileToggleButton,
  LeaveIcon,
  MicrophoneIcon,
  RecordingCircleButton,
} from './debate-room-controls';
import { DebateTileChip, DebateVideoTile } from './debate-video-tile';
import { DeviceOptionGroup } from './device-option-group';
import { MicrophoneLevelMeter } from './microphone-level-meter';
import { useScrollLock } from './use-scroll-lock';

export type DebatePreScreenRemotePresence = 'absent' | 'present' | 'left';

/**
 * The pre-debate screen: a live two-way call from the moment both sides grant the camera, ending
 * when both press ready. Nothing here is recorded.
 *
 * Shares the room's tile but not its layout. This screen puts the two speakers in the design's
 * side-by-side cards, you always on the left, where the room keeps one column ordered by which
 * side of the claim each speaker holds — so crossing into the debate does reflow, and on mobile
 * can swap which of you is on top. That is the cost of "you are always on the left here", and it
 * is deliberate: before the debate the screen is about your own setup, during it about the claim.
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
  audioMuted,
  videoEnabled,
  onToggleAudioMuted,
  onToggleVideoEnabled,
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
  /**
   * Your microphone and camera, shared with the debate room rather than local to this screen, so
   * whatever you set here is what the recorder starts with.
   *
   * GEO-2819 deliberately shipped the intro without these controls. The design brings them back
   * with a rule attached: readiness is held until both are on, so muting is a thing you can do to
   * the introduction but not a state you can take into a recorded debate.
   */
  audioMuted: boolean;
  videoEnabled: boolean;
  onToggleAudioMuted: () => void;
  onToggleVideoEnabled: () => void;
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
  // Named after what the person has to do, not after which flag is false — it is the only thing
  // the screen says about a disabled ready button.
  const enableMediaPrompt =
    audioMuted && !videoEnabled
      ? 'Enable video and audio to start'
      : audioMuted
        ? 'Enable audio to start'
        : !videoEnabled
          ? 'Enable video to start'
          : null;

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
      tileControls={
        mediaReady ? (
          <div className="flex items-center gap-2">
            <DebateTileToggleButton
              ariaLabel={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
              enabled={!audioMuted}
              onClick={onToggleAudioMuted}
              // `readyBusy` as well as `localReady`: readiness is confirmed by the server, so
              // between pressing ready and the round trip returning you could still turn the camera
              // off — and carry exactly the state the gate exists to prevent into the recording.
              disabled={readyBusy || localReady}
            >
              <MicrophoneIcon muted={audioMuted} />
            </DebateTileToggleButton>
            <DebateTileToggleButton
              ariaLabel={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
              enabled={videoEnabled}
              onClick={onToggleVideoEnabled}
              // `readyBusy` as well as `localReady`: readiness is confirmed by the server, so
              // between pressing ready and the round trip returning you could still turn the camera
              // off — and carry exactly the state the gate exists to prevent into the recording.
              disabled={readyBusy || localReady}
            >
              <CameraIcon disabled={!videoEnabled} />
            </DebateTileToggleButton>
          </div>
        ) : null
      }
      // Your readiness is not stated here the way theirs is: the ready button becomes "Waiting for
      // …", and the bottom-right of your own tile is spent on the recording indicator.
      status={<DebateRecordingStatusPill recording={capturing} />}
    >
      <video ref={setLocalVideoElement} className="h-full w-full bg-grey-01 object-cover" playsInline muted autoPlay />
      {/* A disabled camera track keeps sending — as black frames, so the recorder never loses it —
          which is a broken-looking tile rather than a deliberate one. The avatar says "off". */}
      {mediaReady && !videoEnabled && (
        <div className="absolute inset-0 grid place-items-center bg-grey-01">
          <div className="size-16 overflow-hidden rounded-full">
            <Avatar
              avatarUrl={localParticipant?.avatar_cid}
              value={localParticipant?.profile_space_id}
              alt=""
              size={64}
            />
          </div>
        </div>
      )}
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
      // Their readiness is stated either way. "No badge" was ambiguous between not ready and a
      // badge that had not rendered, which is the same reason the recording pill has two states.
      status={remoteReady ? <PreScreenReadyBadge /> : <PreScreenNotReadyBadge />}
    >
      <div
        ref={setRemoteMediaElement}
        className="h-full w-full bg-grey-01 [&>audio]:hidden [&>video]:h-full [&>video]:w-full [&>video]:bg-grey-01 [&>video]:object-cover"
      />
    </DebateVideoTile>
  );

  /**
   * Each speaker is a group: their tile, plus — for you — everything you can change before the
   * debate starts. Each group is one of the design's side-by-side cards.
   *
   * `md` — this stylesheet's breakpoints are desktop-first max-widths, so `md` means *at most*
   * 767px — dissolves the groups with `display: contents`, which drops their boxes and promotes
   * their children into the one card the mobile design draws. That is what lets your controls land
   * under both tiles rather than between them: `order-last` can only reach across a group it is no
   * longer inside.
   */
  const cardGroup = 'flex flex-1 flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3 md:contents';
  const controlsOrder = 'md:order-last';

  const remoteGroup = (
    <div key="remote" className={cx(cardGroup, 'order-2')}>
      {remoteTile}
    </div>
  );

  const localGroup = (
    <div key="local" className={cx(cardGroup, 'order-1')}>
      {localTile}

      {!mediaReady && previewState !== 'requesting' && (
        <button
          type="button"
          onClick={onRetryMedia}
          className={cx(
            'inline-flex min-h-9 items-center justify-center self-center rounded-full bg-text px-4 text-button text-white hover:bg-text/90',
            controlsOrder
          )}
        >
          {previewState === 'denied' ? 'Allow access' : 'Try again'}
        </button>
      )}

      {mediaReady && (
        <>
          <div className={cx('flex w-full flex-col gap-[6px]', controlsOrder)}>
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

          <div className={cx('flex w-full flex-col gap-2', controlsOrder)}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] leading-4 font-normal text-grey-04">Speak to test your mic</p>
              <MicrophoneLevelMeter stream={previewStream} />
            </div>
            <div className="h-px w-full bg-divider" />
          </div>

          <div className={cx('flex w-full flex-col items-center gap-2', controlsOrder)}>
            <button
              type="button"
              onClick={onReady}
              disabled={readyBusy || localReady || previewBusy || connectionSettling || enableMediaPrompt !== null}
              className="flex min-h-10 w-full items-center justify-center rounded-full bg-text px-5 text-button text-white transition-colors hover:bg-text/90 disabled:bg-grey-01 disabled:text-grey-03 disabled:hover:bg-grey-01"
            >
              {localReady
                ? `Waiting for ${remoteName}…`
                : connectionSettling
                  ? 'Connecting…'
                  : readyBusy
                    ? 'Saving...'
                    : remoteReady
                      ? "I'm ready to debate too"
                      : "I'm ready to debate"}
            </button>
            {enableMediaPrompt && <p className="text-[12px] leading-4 text-grey-04">{enableMediaPrompt}</p>}
          </div>
        </>
      )}
    </div>
  );

  /**
   * You are always on the left on desktop, whichever side of the claim you are arguing — hence the
   * `order` above rather than the room's position ordering, which put whoever holds the first slot
   * first. The document order is the mobile one the design draws: your opponent on top, you
   * directly above your own controls. `order` is ignored there, because at that width the groups
   * are `display: contents` and it is their children that are the flex items.
   */
  const orderedGroups = [remoteGroup, localGroup];

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Debate readiness"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text outline-none"
    >
      {/* The claim is given the full width and the speakers a little less, as the design has it —
          a wide headline over the cards — so the caps are per band rather than on `main`. The
          cards are sized so each tile lands back at the ~415px the single-column layout gave it. */}
      <main className="mx-auto flex min-h-dvh w-full max-w-[940px] flex-col items-center justify-center px-2 py-8 sm:px-5 md:max-w-[430px]">
        <div className="mb-5 flex w-full max-w-[900px] flex-col items-center gap-3 md:mb-4 md:max-w-none md:gap-2">
          {/* Replaces the paragraph that sat under the claim. The assurance it also carried — that
              this part is not recorded — is now the "Not recording" pill on your own tile. */}
          <p className="text-center text-mediumTitle text-grey-04 md:text-metadataMedium">
            Introduce yourselves before debating
          </p>
          <h1 className="text-center text-mainPage text-text md:max-w-[390px] md:text-[1.5rem] md:leading-[1.8125rem] md:font-semibold md:tracking-[-0.75px]">
            {claim}
          </h1>
        </div>

        <div className="flex w-full max-w-[900px] items-start gap-5 md:max-w-none md:flex-col md:items-stretch md:gap-3 md:rounded-lg md:border md:border-grey-02 md:bg-white md:p-3">
          {orderedGroups}
        </div>

        {error && (
          <div className="mt-3 flex w-full max-w-[900px] flex-wrap items-center justify-between gap-3 rounded-lg border border-red-01 bg-white px-4 py-3">
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

        <div className="mt-5 flex w-full justify-center">
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

/**
 * Readiness as a fact on a tile, deliberately not a prompt or countdown near the ready button.
 *
 * Sized like the position label and the recording pill rather than as its own badge: all three are
 * chips on a tile, and the opponent's readiness sits in the same bottom-right slot your recording
 * state does. Green survives as the fill because "ready" is the one state worth spotting from
 * across the layout.
 */
function PreScreenReadyBadge() {
  return (
    <DebateTileChip className="bg-green text-text">
      {/* The icon ships at 16px, which is the whole chip. */}
      <span aria-hidden className="grid size-2.5 shrink-0 place-items-center [&>svg]:size-full">
        <Check />
      </span>
      Ready
    </DebateTileChip>
  );
}

function PreScreenNotReadyBadge() {
  return <DebateTileChip className="bg-white/60 text-text">Not ready</DebateTileChip>;
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

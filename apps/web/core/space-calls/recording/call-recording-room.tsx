'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { type CallRecordingState, GeoChatRequestError } from '~/core/debates/api';
import { lobbyErrorMessage } from '~/core/debates/lobbies/lobby-format';
import { LobbyToast } from '~/core/debates/lobbies/lobby-notices';
import { LobbySlot } from '~/core/debates/lobbies/lobby-slots';
import { type LobbyPageView, isMemberView } from '~/core/debates/lobbies/lobby-view';
import { useLobbyVoiceStates } from '~/core/debates/lobbies/lobby-voice';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { callRecordingOf } from './api';
import { useCallRecordingControl } from './hooks';
import type { StageRecordingNotice } from './stage-notice';

export const CALL_RECORDING_COPY = {
  rec: 'REC',
  banner: 'This call is being recorded',
  start: 'Start recording',
  starting: 'Starting…',
  stop: 'Stop recording',
  stopping: 'Stopping…',
  stopConfirm: 'Stop for good? A call has one recording.',
  keepRecording: 'Keep recording',
  startFailed: 'Could not start recording. Try again.',
  stopFailed: 'Could not stop recording. Try again.',
  notInCall: 'Join the call to start recording.',
  alreadyUsed: 'This call has already been recorded. A call has one recording.',
  rateLimited: 'Too many tries. Wait a moment and try again.',
  disabled: 'Recording isn’t available right now.',
  refused: 'Recording couldn’t start. Try again.',
  publishOnEnd: 'Publish the recording',
  publishOnEndHint: 'Anyone can watch it on the call’s page and on Explore. You can change this later.',
  promptTitle: 'This call is being recorded',
  promptBody: 'What you say and show on stage will be in the recording, which the space’s editors may publish.',
  promptOk: 'Got it',
  promptLeave: 'Leave call',
  toast: 'This call is now being recorded, including what you say and show on stage.',
  preJoin: 'This call is being recorded. Joining on stage puts you in the recording.',
  recorded: 'Recorded',
  recordingMeta: 'Recording',
  notRecorded: 'Not recorded',
  recordingFailed: 'Recording failed',
} as const;

/**
 * The recording for the flagged surfaces: controls, the publish choice, the ended page. Telling
 * people a call records reads `callRecordingOf` instead, whatever this browser's flag says.
 */
export function useFlaggedCallRecording(lobby: Pick<LobbyPageView, 'call'> | null): CallRecordingState | null {
  const enabled = useFeatureFlag('spaceCalls');
  return enabled ? callRecordingOf(lobby) : null;
}

/** The viewer edits the call's space; never true for a guest. */
export function canManageCallRecording(lobby: LobbyPageView): boolean {
  return isMemberView(lobby) && lobby.viewer.can_manage_recording === true;
}

/** For the header's meta line; `null` from geo-chat without recording, which says nothing. */
export function callRecordingMetaLabel(lobby: Pick<LobbyPageView, 'call'>): string | null {
  const status = callRecordingOf(lobby)?.status;
  if (!status) return null;
  switch (status) {
    case 'off':
      return CALL_RECORDING_COPY.notRecorded;
    case 'recording':
      return CALL_RECORDING_COPY.recordingMeta;
    case 'failed':
      return CALL_RECORDING_COPY.recordingFailed;
    default:
      return CALL_RECORDING_COPY.recorded;
  }
}

/** Friendly copy for the start refusals the contract names. */
export function startErrorMessage(error: unknown): string {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'call_recording_not_in_call') return CALL_RECORDING_COPY.notInCall;
    if (error.code === 'call_recording_already_used') return CALL_RECORDING_COPY.alreadyUsed;
    if (error.code === 'call_recording_disabled') return CALL_RECORDING_COPY.disabled;
    if (error.status === 429) return CALL_RECORDING_COPY.rateLimited;
  }
  return lobbyErrorMessage(error, CALL_RECORDING_COPY.startFailed);
}

/**
 * Under the call's header (GEO-3421): the REC banner, for everyone while it records, and an
 * editor's Start or Stop behind the flag. A call has one recording window.
 */
export function CallRecordingBar({ lobby }: { lobby: LobbyPageView }) {
  const recording = callRecordingOf(lobby);
  const control = useCallRecordingControl(lobby.lobby_id);
  const [confirmingStop, setConfirmingStop] = React.useState(false);
  const canManage = useFeatureFlag('spaceCalls') && canManageCallRecording(lobby);
  if (!recording) return null;
  // Shown from the click: people are told before the file starts.
  const starting = control.isPending && control.variables === 'start';
  const live = recording.status === 'recording' || starting;
  const canStart = canManage && recording.can_start && !live;
  const refused = canStart && recording.status === 'failed' && recording.end_reason === 'start_failed';
  if (!live && !canStart) return null;

  const run = (action: 'start' | 'stop') => control.mutate(action, { onSuccess: () => setConfirmingStop(false) });

  return (
    <div
      role={live ? 'status' : undefined}
      className="mx-8 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-grey-02 px-3 py-2 md:mx-4"
      data-testid="call-recording-bar"
    >
      {live ? (
        <>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-01 px-2 py-0.5 text-footnoteMedium text-white">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-white" />
            {CALL_RECORDING_COPY.rec}
          </span>
          <Text as="p" variant="metadata" className="min-w-0 flex-1">
            {CALL_RECORDING_COPY.banner}
          </Text>
        </>
      ) : (
        <span className="flex-1" />
      )}
      {canManage ? (
        canStart ? (
          <HubPillButton analyticsLabel="Call recording start" onClick={() => run('start')}>
            {CALL_RECORDING_COPY.start}
          </HubPillButton>
        ) : starting ? null : confirmingStop ? (
          <div className="flex flex-wrap items-center gap-2">
            <Text as="span" variant="footnote" color="grey-04">
              {CALL_RECORDING_COPY.stopConfirm}
            </Text>
            <HubPillButton
              variant="primary"
              analyticsLabel="Call recording stop confirm"
              pending={control.isPending}
              pendingLabel={CALL_RECORDING_COPY.stopping}
              onClick={() => run('stop')}
            >
              {CALL_RECORDING_COPY.stop}
            </HubPillButton>
            <HubPillButton analyticsLabel="Call recording stop cancel" onClick={() => setConfirmingStop(false)}>
              {CALL_RECORDING_COPY.keepRecording}
            </HubPillButton>
          </div>
        ) : (
          <HubPillButton analyticsLabel="Call recording stop" onClick={() => setConfirmingStop(true)}>
            {CALL_RECORDING_COPY.stop}
          </HubPillButton>
        )
      ) : null}
      {control.isError ? (
        <Text as="p" variant="footnote" color="red-01" className="basis-full">
          {control.variables === 'stop'
            ? lobbyErrorMessage(control.error, CALL_RECORDING_COPY.stopFailed)
            : startErrorMessage(control.error)}
        </Text>
      ) : refused ? (
        <Text as="p" variant="footnote" color="grey-04" className="basis-full">
          {CALL_RECORDING_COPY.refused}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * The stage notice, drawn inside the voice room. Waits for voice to connect, so a first join's
 * pre-join check (which says the call is recording) comes first.
 */
export function StageRecordingPrompt({
  notice,
  onAcknowledge,
  onLeave,
}: {
  notice: StageRecordingNotice;
  onAcknowledge: () => void;
  onLeave: () => void;
}) {
  const { connected } = useLobbyVoiceStates();
  if (notice === 'none' || !connected) return null;

  if (notice === 'toast') {
    return (
      <LobbySlot name="notices">
        <LobbyToast
          action={
            <HubPillButton
              analyticsLabel="Call recording toast ok"
              onClick={onAcknowledge}
              className="border-white bg-white"
            >
              {CALL_RECORDING_COPY.promptOk}
            </HubPillButton>
          }
        >
          {CALL_RECORDING_COPY.toast}
        </LobbyToast>
      </LobbySlot>
    );
  }

  return (
    <Root open onOpenChange={open => !open && onAcknowledge()}>
      <Portal>
        <Overlay className="fixed inset-0 z-[1010] flex items-center justify-center bg-text/45 p-5">
          <Content
            className="grid w-[min(380px,100%)] gap-4 rounded-lg bg-white p-5 text-text shadow-card focus:outline-hidden"
            data-testid="call-recording-prompt"
          >
            <div className="grid gap-1 text-center">
              <Title className="text-metadata font-semibold">{CALL_RECORDING_COPY.promptTitle}</Title>
              <Description className="text-[14px] leading-5 text-grey-04">{CALL_RECORDING_COPY.promptBody}</Description>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onLeave} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
                {CALL_RECORDING_COPY.promptLeave}
              </button>
              <button type="button" onClick={onAcknowledge} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
                {CALL_RECORDING_COPY.promptOk}
              </button>
            </div>
          </Content>
        </Overlay>
      </Portal>
    </Root>
  );
}

/** In the pre-join check while the call records. */
export function PreJoinRecordingNote() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-grey-01 px-3 py-2" data-testid="call-pre-join-recording">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-red-01" />
      <Text as="p" variant="metadata">
        {CALL_RECORDING_COPY.preJoin}
      </Text>
    </div>
  );
}

/**
 * Whether ending can carry a publish choice: an editor, with a recording to publish. geo-chat
 * refuses the choice from anyone else without ending the call.
 */
export function useEndCallPublishes(lobby: LobbyPageView): boolean {
  const recording = useFlaggedCallRecording(lobby);
  return (
    recording !== null &&
    canManageCallRecording(lobby) &&
    (recording.status === 'recording' || recording.status === 'processing' || recording.status === 'ready')
  );
}

/** In the End call confirm; leaving it unticked keeps the recording unpublished. */
export function EndCallPublishChoice({
  lobby,
  checked,
  onChange,
}: {
  lobby: LobbyPageView;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  if (!useEndCallPublishes(lobby)) return null;
  return (
    <div className="flex basis-full items-start gap-2" data-testid="end-call-publish">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-text"
      />
      <label htmlFor={id} className="flex flex-col">
        <Text as="span" variant="metadata">
          {CALL_RECORDING_COPY.publishOnEnd}
        </Text>
        <Text as="span" variant="footnote" color="grey-04">
          {CALL_RECORDING_COPY.publishOnEndHint}
        </Text>
      </label>
    </div>
  );
}

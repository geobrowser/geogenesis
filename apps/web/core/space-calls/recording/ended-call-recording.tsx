'use client';

import * as React from 'react';

import type { CallRecordingState } from '~/core/debates/api';
import { lobbyErrorMessage } from '~/core/debates/lobbies/lobby-format';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';

import { Text } from '~/design-system/text';

import { CallRecordingPlayer } from './call-recording-player';
import { canManageCallRecording, useFlaggedCallRecording } from './call-recording-room';
import { usePollWhileProcessing, usePublishCallRecording } from './hooks';

export const ENDED_CALL_RECORDING_COPY = {
  title: 'Recording',
  none: 'This call wasn’t recorded.',
  processing: 'The recording is processing. It will play here when it’s ready.',
  failed: 'The recording failed. There’s nothing to play.',
  neverStarted: 'Recording never started, so there’s nothing to play.',
  interrupted: 'The recording stopped on its own when everyone left the call. What was recorded is kept.',
  published: 'Published: anyone can watch it here and on Explore.',
  unpublished: 'Unpublished: only the space’s editors can watch it.',
  publish: 'Publish',
  unpublish: 'Unpublish',
  publishFailed: 'Could not change this. Try again.',
} as const;

type Visible = { recording: CallRecordingState; editor: boolean };

/** What the viewer may see: editors see everything, everyone else a published recording only. */
export function visibleEndedRecording(recording: CallRecordingState | null, editor: boolean): Visible | null {
  if (!recording) return null;
  if (editor || recording.published) return { recording, editor };
  return null;
}

/**
 * An ended call's recording (GEO-3421), under its closed card: the player, its processing or
 * failed state, and an editor's publish toggle.
 */
export function EndedCallRecording({ lobby }: { lobby: LobbyPageView }) {
  const recording = useFlaggedCallRecording(lobby);
  const editor = canManageCallRecording(lobby);
  usePollWhileProcessing(lobby.lobby_id, recording?.status === 'processing');
  const visible = visibleEndedRecording(recording, editor);
  if (!visible) return null;

  return (
    <section
      aria-label={ENDED_CALL_RECORDING_COPY.title}
      className="flex w-full max-w-3xl flex-col gap-3"
      data-testid="ended-call-recording"
    >
      <EndedRecordingBody callId={lobby.lobby_id} recording={visible.recording} />
      {visible.editor && visible.recording.status !== 'off' && visible.recording.status !== 'failed' ? (
        <PublishToggle callId={lobby.lobby_id} published={visible.recording.published} />
      ) : null}
    </section>
  );
}

function EndedRecordingBody({ callId, recording }: { callId: string; recording: CallRecordingState }) {
  const interrupted =
    recording.end_reason === 'interrupted' ? <Note>{ENDED_CALL_RECORDING_COPY.interrupted}</Note> : null;
  switch (recording.status) {
    case 'off':
    case 'recording':
      // `recording` on an ended call is momentary: ending stops it.
      return (
        <Note>
          {recording.status === 'off' ? ENDED_CALL_RECORDING_COPY.none : ENDED_CALL_RECORDING_COPY.processing}
        </Note>
      );
    case 'failed':
      return (
        <Note>
          {recording.end_reason === 'start_failed'
            ? ENDED_CALL_RECORDING_COPY.neverStarted
            : ENDED_CALL_RECORDING_COPY.failed}
        </Note>
      );
    case 'processing':
      return (
        <>
          <div
            role="status"
            className="flex aspect-video w-full items-center justify-center rounded-xl bg-grey-01 p-4 text-center"
          >
            <Text as="p" variant="metadata" color="grey-04">
              {ENDED_CALL_RECORDING_COPY.processing}
            </Text>
          </div>
          {interrupted}
        </>
      );
    case 'ready':
      return (
        <>
          <CallRecordingPlayer callId={callId} />
          {interrupted}
        </>
      );
  }
}

function PublishToggle({ callId, published }: { callId: string; published: boolean }) {
  const publish = usePublishCallRecording(callId);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Text as="p" variant="metadata" color="grey-04" className="min-w-0 flex-1">
        {published ? ENDED_CALL_RECORDING_COPY.published : ENDED_CALL_RECORDING_COPY.unpublished}
      </Text>
      <HubPillButton
        variant={published ? 'secondary' : 'primary'}
        analyticsLabel={published ? 'Call recording unpublish' : 'Call recording publish'}
        pending={publish.isPending}
        onClick={() => publish.mutate(!published)}
      >
        {published ? ENDED_CALL_RECORDING_COPY.unpublish : ENDED_CALL_RECORDING_COPY.publish}
      </HubPillButton>
      {publish.isError ? (
        <Text as="p" variant="footnote" color="red-01" className="basis-full">
          {lobbyErrorMessage(publish.error, ENDED_CALL_RECORDING_COPY.publishFailed)}
        </Text>
      ) : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" variant="metadata" color="grey-04">
      {children}
    </Text>
  );
}

'use client';

import * as React from 'react';

import { dashlessId } from '~/core/debates/api';

/**
 * What someone on stage is told about a recording (GEO-3421):
 * - `prompt`: going on stage while it records; a confirm, once per call.
 * - `toast`: already on stage when it started; told without being stopped.
 */
export type StageRecordingNotice = 'none' | 'prompt' | 'toast';

export function stageRecordingNotice({
  recording,
  onStage,
  acknowledged,
  onStageWhenStarted,
}: {
  recording: boolean;
  onStage: boolean;
  acknowledged: boolean;
  onStageWhenStarted: boolean;
}): StageRecordingNotice {
  if (!recording || !onStage || acknowledged) return 'none';
  return onStageWhenStarted ? 'toast' : 'prompt';
}

const ackKey = (callId: string) => `geo:call-recording-ack:${dashlessId(callId)}`;

function readAck(callId: string) {
  try {
    return window.localStorage.getItem(ackKey(callId)) === '1';
  } catch {
    return false;
  }
}

function writeAck(callId: string) {
  try {
    window.localStorage.setItem(ackKey(callId), '1');
  } catch {
    // Without storage the prompt comes back on the next visit.
  }
}

/**
 * The viewer's notice for this call. Acknowledging, in the prompt or by joining from the pre-join, holds for the call in
 * this browser. Kept in state as well as storage, so a blocked storage still dismisses it.
 */
export function useStageRecordingNotice(callId: string, recording: boolean, onStage: boolean) {
  const [acknowledged, setAcknowledged] = React.useState(() => typeof window !== 'undefined' && readAck(callId));
  const [previous, setPrevious] = React.useState({ recording, onStage });
  const [onStageWhenStarted, setOnStageWhenStarted] = React.useState(false);
  if (previous.recording !== recording || previous.onStage !== onStage) {
    if (recording && !previous.recording && previous.onStage && onStage) setOnStageWhenStarted(true);
    if (!onStage) setOnStageWhenStarted(false);
    setPrevious({ recording, onStage });
  }

  const acknowledge = React.useCallback(() => {
    writeAck(callId);
    setAcknowledged(true);
  }, [callId]);

  return {
    notice: stageRecordingNotice({ recording, onStage, acknowledged, onStageWhenStarted }),
    acknowledge,
  };
}

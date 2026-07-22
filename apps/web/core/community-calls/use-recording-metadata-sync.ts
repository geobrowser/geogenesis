import * as React from 'react';

import type { Room } from 'livekit-client';
import { RoomEvent } from 'livekit-client';

type RoomRecordingMetadata = {
  recording: boolean;
  egressId: string | null;
  recordingStartedAt: number | null;
};

/** Parses the `{recording, egressId, recordingStartedAt}` JSON curator-backend's egress webhook
 *  handler merges into LiveKit room metadata (read-merge-write, unrelated fields preserved). */
function parseRoomRecordingMetadata(metadata: string | undefined): RoomRecordingMetadata | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.recording !== 'boolean') return null;
    return {
      recording: parsed.recording,
      egressId: typeof parsed.egressId === 'string' ? parsed.egressId : null,
      recordingStartedAt: typeof parsed.recordingStartedAt === 'number' ? parsed.recordingStartedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Syncs recording state from LiveKit room metadata so every participant — editors and
 * viewers alike — sees an accurate indicator, not just the client that toggled the button.
 * `markRecordingStarted`/`markRecordingStopped` let the toggling client update immediately
 * (optimistic); the next real metadata event from the webhook overwrites/confirms it.
 */
export function useRecordingMetadataSync(room: Room) {
  const [recording, setRecording] = React.useState(false);
  const [egressId, setEgressId] = React.useState<string | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    const applyMetadata = (metadata: string | undefined) => {
      const parsed = parseRoomRecordingMetadata(metadata);
      if (!parsed) return;
      setRecording(parsed.recording);
      setEgressId(parsed.egressId);
      setRecordingStartedAt(parsed.recordingStartedAt);
    };

    const onMetadataChanged = (metadata: string | undefined) => applyMetadata(metadata);
    const onConnected = () => applyMetadata(room.metadata);

    room.on(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    room.on(RoomEvent.Connected, onConnected);
    applyMetadata(room.metadata);

    return () => {
      room.off(RoomEvent.RoomMetadataChanged, onMetadataChanged);
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room]);

  const markRecordingStarted = React.useCallback((newEgressId: string) => {
    setRecording(true);
    setEgressId(newEgressId);
    setRecordingStartedAt(Date.now());
  }, []);

  const markRecordingStopped = React.useCallback(() => {
    setRecording(false);
    setEgressId(null);
    setRecordingStartedAt(null);
  }, []);

  return { recording, egressId, recordingStartedAt, markRecordingStarted, markRecordingStopped };
}

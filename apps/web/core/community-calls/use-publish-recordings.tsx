'use client';

import * as React from 'react';

import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';

import { buildPublishRecordingsOps } from './call-ops';
import { fetchEventRecordingUrls, fetchOccurrenceEventId } from './fetch-occurrence-event';
import { Occurrence, Recording } from './types';
import { useCommunityCallIdentityToken } from './use-identity-token';

/**
 * Publishes an occurrence's recordings to its `Community call event` entity: server-copy each
 * recording from S3 to IPFS via the publish-recording route, then submit the `Recordings`
 * relations through governance as one proposal, minting the event if the occurrence was never
 * published. Shared by the Recordings tab and the past-occurrence row.
 *
 * `publishingKey` is the `busyKey` of the in-flight publish, or null. Pass a stable key per
 * button so a caller can show a "Publishing…" state on just that row or recording.
 */
export function usePublishRecordings() {
  const { makeProposal } = usePublish();
  const [, setToast] = useToast();
  const { getToken } = useCommunityCallIdentityToken();
  const [publishingKey, setPublishingKey] = React.useState<string | null>(null);

  const publish = React.useCallback(
    async ({
      recordings,
      spaceId,
      callId,
      seriesName,
      seriesDescription,
      occurrence,
      busyKey,
    }: {
      recordings: Recording[];
      spaceId: string;
      callId: string;
      seriesName: string;
      seriesDescription: string;
      occurrence: Occurrence;
      busyKey: string;
    }) => {
      if (recordings.length === 0) return;
      setPublishingKey(busyKey);

      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');

        const existingEventId = await fetchOccurrenceEventId(callId, spaceId, occurrence.startMs);
        const existingUrls = existingEventId ? await fetchEventRecordingUrls(existingEventId, spaceId) : [];

        // Copy each recording to IPFS, skipping any CID already on the event. Sequential: a
        // recording can be several GB, so parallel copies would pile up server-side.
        const cids: string[] = [];
        for (const recording of recordings) {
          const res = await fetch('/api/community-call/publish-recording', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ filename: recording.filename }),
          });
          const payload = (await res.json().catch(() => ({}))) as { cid?: string; error?: string };
          if (!res.ok || !payload.cid) throw new Error(payload.error ?? `copy failed (${res.status})`);
          if (!existingUrls.includes(payload.cid) && !cids.includes(payload.cid)) cids.push(payload.cid);
        }

        if (cids.length === 0) {
          setToast(<>Recording already published.</>);
          return;
        }

        const { values, relations } = buildPublishRecordingsOps({
          spaceId,
          seriesId: callId,
          seriesName,
          seriesDescription,
          occurrenceStart: occurrence.startMs,
          occurrenceEnd: occurrence.endMs,
          ipfsUrls: cids,
          existingEventId,
        });

        await makeProposal({
          values,
          relations,
          spaceId,
          name: `Publish recording${cids.length > 1 ? 's' : ''} for ${seriesName}`,
          onSuccess: () => setToast(<>Recording published to the graph.</>),
          onError: () => setToast(<>Couldn’t publish the recording.</>),
        });
      } catch (error) {
        console.error('[publish-recording]', error);
        setToast(<>Couldn’t publish the recording: {error instanceof Error ? error.message : 'unknown error'}</>);
      } finally {
        setPublishingKey(null);
      }
    },
    [getToken, makeProposal, setToast]
  );

  return { publish, publishingKey };
}

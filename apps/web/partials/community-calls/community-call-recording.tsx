'use client';

import * as React from 'react';

import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { isPlayableRecordingUrl } from '~/core/community-calls/recordings';
import { useRelations } from '~/core/sync/use-store';

import { ENTITY_PAGE_CONTENT_MAX_WIDTH } from '~/partials/entity-page/entity-page-layout';

import { PublishedRecordingPlayer, type RecordingSource } from './published-recording-player';

/**
 * A `Community call event`'s recording, rendered in the entity page's cover slot. Recordings
 * resolve from the sync store once it has synced, so edits and deletes reflect live; until then
 * the server-resolved URLs keep the player from flashing empty.
 */
export function CommunityCallRecording({
  entityId,
  spaceId,
  serverRecordingUrls,
}: {
  entityId: string;
  spaceId: string;
  serverRecordingUrls: string[];
}) {
  const relations = useRelations({
    selector: r =>
      r.fromEntity.id === entityId && r.type.id === EVENT_SCHEMA.RECORDINGS_PROPERTY && r.spaceId === spaceId,
  });

  const sources: RecordingSource[] =
    relations.length > 0
      ? relations.map(r => ({
          directUrl: isPlayableRecordingUrl(r.toEntity.value) ? r.toEntity.value : null,
          videoEntityId: r.toEntity.id,
        }))
      : serverRecordingUrls.map(url => ({ directUrl: url, videoEntityId: null }));

  if (sources.length === 0) return null;

  return (
    <div className="mx-auto mb-6 w-full px-4" style={{ maxWidth: ENTITY_PAGE_CONTENT_MAX_WIDTH }}>
      <PublishedRecordingPlayer sources={sources} spaceId={spaceId} />
    </div>
  );
}

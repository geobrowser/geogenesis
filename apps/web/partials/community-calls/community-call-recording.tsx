'use client';

import * as React from 'react';

import { useRecordingSources } from '~/core/community-calls/use-recording-sources';

import { CONTENT_MAX_WIDTH } from '~/partials/entity-page/editable-entity-cover-avatar-header';

import { PublishedRecordingPlayer } from './published-recording-player';

/**
 * A `Community call event`'s recording, rendered in the entity page's cover slot. Other surfaces
 * lay the player out themselves off `useRecordingSources` rather than going through here.
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
  const sources = useRecordingSources({ entityId, spaceId, serverRecordingUrls });

  if (sources.length === 0) return null;

  return (
    <div className="mx-auto mb-6 w-full px-4" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
      <PublishedRecordingPlayer sources={sources} spaceId={spaceId} />
    </div>
  );
}

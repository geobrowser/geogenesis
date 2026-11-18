'use client';

import { useRelations } from '~/core/sync/use-store';

import { EVENT_SCHEMA } from './constants';
import { type RecordingSource, isPlayableRecordingUrl } from './recordings';

export function useRecordingSources({
  entityId,
  spaceId,
  serverRecordingUrls = [],
  relationTypeId = EVENT_SCHEMA.RECORDINGS_PROPERTY,
}: {
  entityId: string;
  spaceId: string;
  serverRecordingUrls?: string[];
  relationTypeId?: string;
}): RecordingSource[] {
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === relationTypeId && r.spaceId === spaceId,
  });

  // A published Video with no playable URL decodes to an empty value (a call page link, GEO-3593):
  // nothing can play it, so it is not a source. A local one still holds its entity id here.
  const playable = relations.filter(r => r.toEntity.value !== '');
  if (relations.length > 0) {
    return playable.map(r => ({
      directUrl: isPlayableRecordingUrl(r.toEntity.value) ? r.toEntity.value : null,
      videoEntityId: r.toEntity.id,
    }));
  }

  return serverRecordingUrls.map(url => ({ directUrl: url, videoEntityId: null }));
}

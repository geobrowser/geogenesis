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

  if (relations.length > 0) {
    return relations.map(r => ({
      directUrl: isPlayableRecordingUrl(r.toEntity.value) ? r.toEntity.value : null,
      videoEntityId: r.toEntity.id,
    }));
  }

  return serverRecordingUrls.map(url => ({ directUrl: url, videoEntityId: null }));
}

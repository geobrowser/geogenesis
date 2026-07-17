import type { Relation } from '~/core/types';

import { EVENT_SCHEMA } from './constants';

/**
 * A `Recordings` relation only carries a playable URL once the decoder has resolved its Video
 * entity; before then `toEntity.value` is just that entity's id.
 */
export const isPlayableRecordingUrl = (value: string) => value.startsWith('ipfs://') || value.startsWith('http');

/** A recording either as a directly-playable URL or an unresolved Video entity id. */
export type RecordingSource = {
  /** Public IPFS/HTTP URL */
  directUrl: string | null;
  /** Video entity to read the IPFS URL off of */
  videoEntityId: string | null;
};

/**
 * Public recording URLs for a `Community call event` entity. The relation decoder
 * (`RelationDtoLive`) resolves each recording's Video entity down to its IPFS URL on
 * `toEntity.value`, so a published recording plays straight from the gateway with no
 * signed-URL round-trip.
 */
export function getRecordingUrls(relations: Relation[]): string[] {
  return relations
    .filter(r => r.type.id === EVENT_SCHEMA.RECORDINGS_PROPERTY)
    .map(r => r.toEntity.value)
    .filter(isPlayableRecordingUrl);
}

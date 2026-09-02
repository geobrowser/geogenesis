'use client';

import * as React from 'react';

import {
  DEBATE_VIDEOS_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  WEB_URL_PROPERTY_ID,
} from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';

/**
 * The poster still for each debate, keyed by debate id.
 *
 * Two hops, because that is how the ontology stores it: a Debate points at its Videos, and the
 * still hangs off the *video* as `Key frame` → Image, whose `IPFS URL` value is the URI. Both hops
 * are batched across every debate on screen rather than run per row.
 *
 * A debate with no video, or a video published before a keyframe was captured, simply has no
 * entry — callers draw their own placeholder rather than an image element pointed at nothing.
 */
export function useDebateKeyframes(debates: Entity[]): Map<string, string> {
  const videoIdsByDebateId = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const debate of debates) {
      const videoIds = relationTargets(debate.relations, DEBATE_VIDEOS_PROPERTY_ID);
      if (videoIds.length > 0) map.set(debate.id, videoIds);
    }
    return map;
  }, [debates]);

  const videoIds = React.useMemo(() => [...new Set([...videoIdsByDebateId.values()].flat())], [videoIdsByDebateId]);

  const { entities: videos } = useQueryEntities({
    where: { id: { in: videoIds } },
    first: videoIds.length || 1,
    enabled: videoIds.length > 0,
  });

  const keyframeIdByVideoId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const video of videos) {
      const keyframeId = relationTargets(video.relations, KEY_FRAME_IMAGE_PROPERTY_ID)[0];
      if (keyframeId) map.set(video.id, keyframeId);
    }
    return map;
  }, [videos]);

  const keyframeIds = React.useMemo(() => [...new Set(keyframeIdByVideoId.values())], [keyframeIdByVideoId]);

  const { entities: keyframes } = useQueryEntities({
    where: { id: { in: keyframeIds } },
    first: keyframeIds.length || 1,
    enabled: keyframeIds.length > 0,
  });

  const urlByKeyframeId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const keyframe of keyframes) {
      // `IPFS URL` first for pinned stills; `Web URL` carries the geo-chat URL for stills left in
      // object storage.
      const url = valueForProperty(keyframe, IMAGE_URL_PROPERTY_ID) ?? valueForProperty(keyframe, WEB_URL_PROPERTY_ID);
      if (url) map.set(keyframe.id, url);
    }
    return map;
  }, [keyframes]);

  return React.useMemo(() => {
    const byDebateId = new Map<string, string>();
    for (const [debateId, ids] of videoIdsByDebateId) {
      for (const videoId of ids) {
        const keyframeId = keyframeIdByVideoId.get(videoId);
        const url = keyframeId ? urlByKeyframeId.get(keyframeId) : undefined;
        if (url) {
          byDebateId.set(debateId, url);
          break;
        }
      }
    }
    return byDebateId;
  }, [keyframeIdByVideoId, urlByKeyframeId, videoIdsByDebateId]);
}

function valueForProperty(entity: Entity, propertyId: string): string | undefined {
  const value = entity.values?.find(v => v.isDeleted !== true && ID.equals(v.property.id, propertyId))?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function relationTargets(relations: Relation[], propertyId: string): string[] {
  return relations
    .filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId))
    .map(relation => relation.toEntity.id);
}

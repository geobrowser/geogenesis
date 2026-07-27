'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { KEY_FRAME_IMAGE_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import { getRelationsByFromEntityId } from '~/core/io/queries';
import { useSpaceAwareRelation, useValues } from '~/core/sync/use-store';

function isDirectMediaUrl(value: string | null | undefined): value is string {
  return Boolean(value && (value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://')));
}

/**
 * Resolves the keyframe image URL for a video entity, reading the keyframe
 * relation from the store when present and otherwise fetching only that
 * relation from the network. The network read is cached under a stable key so
 * repeated hooks for the same video dedupe onto one request.
 */
export function useVideoKeyframeUrl(videoEntityId: string | undefined, spaceId: string): string | undefined {
  const storeKeyframeRelation = useSpaceAwareRelation({
    selector: r =>
      Boolean(videoEntityId) && r.fromEntity.id === videoEntityId && ID.equals(r.type.id, KEY_FRAME_IMAGE_PROPERTY),
    spaceId,
  });

  const { data: fetchedRelations } = useQuery({
    queryKey: ['network', 'relations-by-property', videoEntityId, KEY_FRAME_IMAGE_PROPERTY, spaceId],
    queryFn: ({ signal }) =>
      Effect.runPromise(getRelationsByFromEntityId(videoEntityId as string, KEY_FRAME_IMAGE_PROPERTY, spaceId, signal)),
    enabled: Boolean(videoEntityId) && !storeKeyframeRelation,
    staleTime: 5 * 60 * 1000,
  });

  const fetchedKeyframe = fetchedRelations?.[0];
  const fetchedImageUrl =
    typeof fetchedKeyframe?.toEntity.value === 'string' ? fetchedKeyframe.toEntity.value : undefined;

  const raw = storeKeyframeRelation?.toEntity.value ?? fetchedImageUrl;
  const imageEntityId = storeKeyframeRelation?.toEntity.id ?? fetchedKeyframe?.toEntity.id;
  const imageSpaceId = storeKeyframeRelation?.toSpaceId ?? spaceId;

  const lookupId = isDirectMediaUrl(raw) ? undefined : raw || imageEntityId;

  const imageValues = useValues({ selector: v => Boolean(lookupId) && v.entity.id === lookupId });

  const lookedUp = React.useMemo(() => {
    const urls = imageValues.filter(v => isDirectMediaUrl(v.value));
    return urls.find(v => v.spaceId === imageSpaceId)?.value ?? urls[0]?.value;
  }, [imageValues, imageSpaceId]);

  if (isDirectMediaUrl(raw)) return raw;
  return lookedUp ?? undefined;
}

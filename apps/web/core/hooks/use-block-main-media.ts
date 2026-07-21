'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import type { BlockMediaKind } from '~/core/blocks/data/resolve-main-media-property';
import { KEY_FRAME_IMAGE_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import { getRelationsByFromEntityId } from '~/core/io/queries';
import { useSpaceAwareRelation, useValues } from '~/core/sync/use-store';
import { useEntityMedia } from '~/core/utils/use-entity-media';

function isDirectMediaUrl(value: string | null | undefined): value is string {
  return Boolean(value && (value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://')));
}

/**
 * Resolves the gallery/list main image URL for an entity.
 */
export function useBlockMainMediaUrl({
  entityId,
  spaceId,
  mediaPropertyId,
  mediaKind = 'IMAGE',
  fallbackHint,
}: {
  entityId: string;
  spaceId: string;
  mediaPropertyId: string | null;
  mediaKind?: BlockMediaKind;
  fallbackHint?: string | null;
}): string | undefined {
  const cache = useQueryClient();

  const selectedRelation = useSpaceAwareRelation({
    selector: r =>
      Boolean(mediaPropertyId) && r.fromEntity.id === entityId && ID.equals(r.type.id, mediaPropertyId as string),
    spaceId,
  });

  const { avatarUrl, coverUrl } = useEntityMedia(mediaPropertyId ? undefined : entityId, spaceId);

  const selectedEntityId = selectedRelation?.toEntity.id;
  const selectedSpaceId = selectedRelation?.toSpaceId ?? spaceId;
  const isVideoMedia = Boolean(
    mediaPropertyId && (mediaKind === 'VIDEO' || selectedRelation?.renderableType === 'VIDEO')
  );

  const storeKeyframeRelation = useSpaceAwareRelation({
    selector: r =>
      Boolean(isVideoMedia && selectedEntityId) &&
      r.fromEntity.id === selectedEntityId &&
      ID.equals(r.type.id, KEY_FRAME_IMAGE_PROPERTY),
    spaceId: selectedSpaceId,
  });

  const [fetchedKeyframe, setFetchedKeyframe] = React.useState<{
    videoEntityId: string;
    imageEntityId?: string;
    imageUrl?: string;
  } | null>(null);

  React.useEffect(() => {
    if (!isVideoMedia || !selectedEntityId || storeKeyframeRelation) {
      return;
    }

    let cancelled = false;

    const fetchKeyframe = async () => {
      try {
        const relations = await cache.fetchQuery({
          queryKey: ['network', 'relations-by-property', selectedEntityId, KEY_FRAME_IMAGE_PROPERTY, selectedSpaceId],
          queryFn: ({ signal }) =>
            Effect.runPromise(
              getRelationsByFromEntityId(selectedEntityId, KEY_FRAME_IMAGE_PROPERTY, selectedSpaceId, signal)
            ),
          staleTime: 5 * 60 * 1000,
        });

        const keyframe = relations[0];
        if (!keyframe || cancelled) return;

        const imageUrl = keyframe.toEntity.value;
        setFetchedKeyframe({
          videoEntityId: selectedEntityId,
          imageEntityId: keyframe.toEntity.id,
          imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
        });
      } catch {}
    };

    void fetchKeyframe();

    return () => {
      cancelled = true;
    };
  }, [isVideoMedia, selectedEntityId, storeKeyframeRelation, selectedSpaceId, cache]);

  const keyframeFromFetch =
    fetchedKeyframe && fetchedKeyframe.videoEntityId === selectedEntityId ? fetchedKeyframe : null;

  const imageSource = React.useMemo(() => {
    if (isVideoMedia) {
      return {
        raw: storeKeyframeRelation?.toEntity.value ?? keyframeFromFetch?.imageUrl,
        imageEntityId: storeKeyframeRelation?.toEntity.id ?? keyframeFromFetch?.imageEntityId,
        imageSpaceId: storeKeyframeRelation?.toSpaceId ?? selectedSpaceId,
      };
    }

    if (mediaPropertyId) {
      return {
        raw: selectedRelation?.toEntity.value,
        imageEntityId: selectedEntityId,
        imageSpaceId: selectedSpaceId,
      };
    }

    return {
      raw: coverUrl ?? avatarUrl ?? fallbackHint ?? undefined,
      imageEntityId: undefined,
      imageSpaceId: spaceId,
    };
  }, [
    isVideoMedia,
    mediaPropertyId,
    storeKeyframeRelation,
    keyframeFromFetch,
    selectedRelation,
    selectedEntityId,
    selectedSpaceId,
    coverUrl,
    avatarUrl,
    fallbackHint,
    spaceId,
  ]);

  const lookupId = isDirectMediaUrl(imageSource.raw) ? undefined : imageSource.raw || imageSource.imageEntityId;

  const imageValues = useValues({ selector: v => Boolean(lookupId) && v.entity.id === lookupId });

  const lookedUp = React.useMemo(() => {
    const urls = imageValues.filter(v => isDirectMediaUrl(v.value));
    return urls.find(v => v.spaceId === imageSource.imageSpaceId)?.value ?? urls[0]?.value;
  }, [imageValues, imageSource.imageSpaceId]);

  if (isDirectMediaUrl(imageSource.raw)) return imageSource.raw;
  return lookedUp ?? undefined;
}

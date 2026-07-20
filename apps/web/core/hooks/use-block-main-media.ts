'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import type { BlockMediaKind } from '~/core/blocks/data/resolve-main-media-property';
import { KEY_FRAME_IMAGE_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import { getRelationsByFromEntityId } from '~/core/io/queries';
import { useSpaceAwareRelation } from '~/core/sync/use-store';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';

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

  const coverRelation = useSpaceAwareRelation({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === entityId,
    spaceId,
  });

  const avatarRelation = useSpaceAwareRelation({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === entityId,
    spaceId,
  });

  const selectedEntityId = selectedRelation?.toEntity.id;
  const isVideoMedia = Boolean(
    mediaPropertyId && (mediaKind === 'VIDEO' || selectedRelation?.renderableType === 'VIDEO')
  );

  const storeKeyframeRelation = useSpaceAwareRelation({
    selector: r =>
      Boolean(isVideoMedia && selectedEntityId) &&
      r.fromEntity.id === selectedEntityId &&
      ID.equals(r.type.id, KEY_FRAME_IMAGE_PROPERTY),
    spaceId,
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
          queryKey: ['network', 'relations-by-property', selectedEntityId, KEY_FRAME_IMAGE_PROPERTY, spaceId],
          queryFn: ({ signal }) =>
            Effect.runPromise(getRelationsByFromEntityId(selectedEntityId, KEY_FRAME_IMAGE_PROPERTY, spaceId, signal)),
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
  }, [isVideoMedia, selectedEntityId, storeKeyframeRelation, spaceId, cache]);

  const keyframeFromFetch =
    fetchedKeyframe && fetchedKeyframe.videoEntityId === selectedEntityId ? fetchedKeyframe : null;

  const imageSource = React.useMemo(() => {
    if (isVideoMedia) {
      const raw = storeKeyframeRelation?.toEntity.value ?? keyframeFromFetch?.imageUrl;
      const imageEntityId = storeKeyframeRelation?.toEntity.id ?? keyframeFromFetch?.imageEntityId;
      return { raw, imageEntityId };
    }

    if (mediaPropertyId) {
      return {
        raw: selectedRelation?.toEntity.value,
        imageEntityId: selectedEntityId,
      };
    }

    return {
      raw: coverRelation?.toEntity.value ?? avatarRelation?.toEntity.value ?? fallbackHint ?? undefined,
      imageEntityId: coverRelation?.toEntity.id ?? avatarRelation?.toEntity.id,
    };
  }, [
    isVideoMedia,
    mediaPropertyId,
    storeKeyframeRelation,
    keyframeFromFetch,
    selectedRelation,
    selectedEntityId,
    coverRelation,
    avatarRelation,
    fallbackHint,
  ]);

  const lookupId = isDirectMediaUrl(imageSource.raw) ? undefined : imageSource.raw || imageSource.imageEntityId;

  const lookedUp = useImageUrlFromEntity(lookupId, spaceId);

  if (isDirectMediaUrl(imageSource.raw)) return imageSource.raw;
  if (lookedUp) return lookedUp;
  return undefined;
}

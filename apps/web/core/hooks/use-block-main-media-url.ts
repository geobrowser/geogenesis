'use client';

import * as React from 'react';

import type { BlockMediaKind } from '~/core/blocks/data/resolve-main-media-property';
import { ID } from '~/core/id';
import { useSpaceAwareRelation, useValues } from '~/core/sync/use-store';
import { useEntityMedia } from '~/core/utils/use-entity-media';

import { useVideoKeyframeUrl } from './use-video-keyframe-url';

function isDirectMediaUrl(value: string | null | undefined): value is string {
  return Boolean(value && (value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://')));
}

export type BlockMainMediaUrl = {
  url: string | undefined;
  /**
   * True while the URL is still being resolved over the network. Without it, `url` being
   * undefined reads as "this row has no image", and a view that substitutes a placeholder shows
   * one on every card before replacing it with the real image a moment later.
   */
  isResolving: boolean;
};

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
}): BlockMainMediaUrl {
  const selectedRelation = useSpaceAwareRelation({
    selector: r =>
      Boolean(mediaPropertyId) && r.fromEntity.id === entityId && ID.equals(r.type.id, mediaPropertyId as string),
    spaceId,
  });

  const {
    avatarUrl,
    coverUrl,
    isResolving: isEntityMediaResolving,
  } = useEntityMedia(mediaPropertyId ? undefined : entityId, spaceId);

  const selectedEntityId = selectedRelation?.toEntity.id;
  const selectedSpaceId = selectedRelation?.toSpaceId ?? spaceId;
  const isVideoMedia = Boolean(
    mediaPropertyId && (mediaKind === 'VIDEO' || selectedRelation?.renderableType === 'VIDEO')
  );

  const { url: keyframeUrl, isResolving: isKeyframeResolving } = useVideoKeyframeUrl(
    isVideoMedia ? selectedEntityId : undefined,
    selectedSpaceId
  );

  const imageSource = React.useMemo(() => {
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
    mediaPropertyId,
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

  if (isVideoMedia) return { url: keyframeUrl, isResolving: !keyframeUrl && isKeyframeResolving };
  if (isDirectMediaUrl(imageSource.raw)) return { url: imageSource.raw, isResolving: false };

  const url = lookedUp ?? undefined;

  // With no media property configured we're waiting on the entity's own avatar/cover lookup.
  // With one, the relation comes down with the row itself, so there's nothing further to wait
  // for — either it points somewhere or this row genuinely has no image.
  const isResolving = !url && !mediaPropertyId && isEntityMediaResolving;

  return { url, isResolving };
}

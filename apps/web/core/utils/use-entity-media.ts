'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import * as React from 'react';

import { getEntity } from '~/core/io/queries';
import { useRelation, useValues } from '~/core/sync/use-store';

export function useImageUrlFromEntity(imageEntityId: string | undefined, spaceId: string): string | undefined {
  const imageValues = useValues({
    selector: v => v.entity.id === imageEntityId && v.spaceId === spaceId,
  });

  if (!imageEntityId || imageValues.length === 0) return undefined;

  const imageUrlValue = imageValues.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));

  return imageUrlValue?.value;
}

export function useVideoUrlFromEntity(videoEntityId: string | undefined, spaceId: string): string | undefined {
  const videoValues = useValues({
    selector: v => v.entity.id === videoEntityId && v.spaceId === spaceId,
  });

  if (!videoEntityId || videoValues.length === 0) return undefined;

  const videoUrlValue = videoValues.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));

  return videoUrlValue?.value;
}

export function useEntityAvatarUrl(entityId: string | undefined, spaceId: string): string | undefined {
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = React.useState<string | undefined>(undefined);

  const storeAvatarRelation = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === ContentIds.AVATAR_PROPERTY && r.spaceId === spaceId,
  });

  const storeAvatarEntityId = storeAvatarRelation?.toEntity.id;
  const storeImageUrl = useImageUrlFromEntity(storeAvatarEntityId, spaceId);

  React.useEffect(() => {
    if (!entityId || storeImageUrl) {
      return;
    }

    const fetchAvatar = async () => {
      try {
        const entity = await Effect.runPromise(getEntity(entityId, spaceId));
        if (!entity) return;

        const avatarRelation = entity.relations.find(r => r.type.id === ContentIds.AVATAR_PROPERTY);
        if (!avatarRelation) return;

        const imageUrl = avatarRelation.toEntity.value;
        if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('ipfs://')) {
          setFetchedAvatarUrl(imageUrl);
        }
      } catch {
        // ignored — entity may not exist
      }
    };

    fetchAvatar();
  }, [entityId, spaceId, storeImageUrl]);

  return storeImageUrl ?? fetchedAvatarUrl;
}

export function useEntityCoverUrl(entityId: string | undefined, spaceId: string): string | undefined {
  const [fetchedCoverUrl, setFetchedCoverUrl] = React.useState<string | undefined>(undefined);

  const storeCoverRelation = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === SystemIds.COVER_PROPERTY && r.spaceId === spaceId,
  });

  const storeCoverEntityId = storeCoverRelation?.toEntity.id;
  const storeImageUrl = useImageUrlFromEntity(storeCoverEntityId, spaceId);

  React.useEffect(() => {
    if (!entityId || storeImageUrl) {
      return;
    }

    const fetchCover = async () => {
      try {
        const entity = await Effect.runPromise(getEntity(entityId, spaceId));
        if (!entity) return;

        const coverRelation = entity.relations.find(r => r.type.id === SystemIds.COVER_PROPERTY);
        if (!coverRelation) return;

        const imageUrl = coverRelation.toEntity.value;
        if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('ipfs://')) {
          setFetchedCoverUrl(imageUrl);
        }
      } catch {
        // ignored — entity may not exist
      }
    };

    fetchCover();
  }, [entityId, spaceId, storeImageUrl]);

  return storeImageUrl ?? fetchedCoverUrl;
}

/** Returns avatar ?? cover for an entity. */
export function useEntityMediaUrl(entityId: string | undefined, spaceId: string): string | undefined {
  const avatarUrl = useEntityAvatarUrl(entityId, spaceId);
  const coverUrl = useEntityCoverUrl(entityId, spaceId);
  return avatarUrl ?? coverUrl;
}

/** Returns both avatar and cover URLs for an entity in a single hook. */
export function useEntityMedia(
  entityId: string | undefined,
  spaceId: string
): { avatarUrl: string | undefined; coverUrl: string | undefined } {
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = React.useState<string | undefined>(undefined);
  const [fetchedCoverUrl, setFetchedCoverUrl] = React.useState<string | undefined>(undefined);

  const storeAvatarRelation = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === ContentIds.AVATAR_PROPERTY && r.spaceId === spaceId,
  });

  const storeAvatarEntityId = storeAvatarRelation?.toEntity.id;
  const storeAvatarUrl = useImageUrlFromEntity(storeAvatarEntityId, spaceId);

  const storeCoverRelation = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === SystemIds.COVER_PROPERTY && r.spaceId === spaceId,
  });

  const storeCoverEntityId = storeCoverRelation?.toEntity.id;
  const storeCoverUrl = useImageUrlFromEntity(storeCoverEntityId, spaceId);

  React.useEffect(() => {
    if (!entityId || (storeAvatarUrl && storeCoverUrl)) {
      return;
    }

    const fetchMedia = async () => {
      try {
        const entity = await Effect.runPromise(getEntity(entityId, spaceId));
        if (!entity) return;

        if (!storeAvatarUrl) {
          const avatarRelation = entity.relations.find(r => r.type.id === ContentIds.AVATAR_PROPERTY);
          if (avatarRelation) {
            const imageUrl = avatarRelation.toEntity.value;
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('ipfs://')) {
              setFetchedAvatarUrl(imageUrl);
            }
          }
        }

        if (!storeCoverUrl) {
          const coverRelation = entity.relations.find(r => r.type.id === SystemIds.COVER_PROPERTY);
          if (coverRelation) {
            const imageUrl = coverRelation.toEntity.value;
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('ipfs://')) {
              setFetchedCoverUrl(imageUrl);
            }
          }
        }
      } catch {
        // ignored — entity may not exist
      }
    };

    fetchMedia();
  }, [entityId, spaceId, storeAvatarUrl, storeCoverUrl]);

  return {
    avatarUrl: storeAvatarUrl ?? fetchedAvatarUrl,
    coverUrl: storeCoverUrl ?? fetchedCoverUrl,
  };
}

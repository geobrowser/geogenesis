'use client';

import { ContentIds } from '@geoprotocol/geo-sdk';
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

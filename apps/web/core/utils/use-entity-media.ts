'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getRelationsByFromEntityId } from '~/core/io/queries';
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
  const cache = useQueryClient();

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
        // Fetch only the avatar relation for this entity rather than draining
        // the entity's entire relation set (`getEntity`). Cached under a stable
        // key so repeated media hooks for the same entity reuse one request.
        // Media URLs are effectively immutable, so keep results fresh for a
        // while to dedupe across remounts, not just concurrent in-flight calls.
        const relations = await cache.fetchQuery({
          queryKey: ['network', 'relations-by-property', entityId, ContentIds.AVATAR_PROPERTY, spaceId],
          queryFn: ({ signal }) =>
            Effect.runPromise(getRelationsByFromEntityId(entityId, ContentIds.AVATAR_PROPERTY, spaceId, signal)),
          staleTime: 5 * 60 * 1000,
        });

        const avatarRelation = relations[0];
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
  }, [entityId, spaceId, storeImageUrl, cache]);

  return storeImageUrl ?? fetchedAvatarUrl;
}

export function useEntityCoverUrl(entityId: string | undefined, spaceId: string): string | undefined {
  const [fetchedCoverUrl, setFetchedCoverUrl] = React.useState<string | undefined>(undefined);
  const cache = useQueryClient();

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
        // Fetch only the cover relation for this entity rather than draining
        // the entity's entire relation set (`getEntity`). Cached under a stable
        // key so repeated media hooks for the same entity reuse one request.
        // Media URLs are effectively immutable, so keep results fresh for a
        // while to dedupe across remounts, not just concurrent in-flight calls.
        const relations = await cache.fetchQuery({
          queryKey: ['network', 'relations-by-property', entityId, SystemIds.COVER_PROPERTY, spaceId],
          queryFn: ({ signal }) =>
            Effect.runPromise(getRelationsByFromEntityId(entityId, SystemIds.COVER_PROPERTY, spaceId, signal)),
          staleTime: 5 * 60 * 1000,
        });

        const coverRelation = relations[0];
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
  }, [entityId, spaceId, storeImageUrl, cache]);

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
  const cache = useQueryClient();

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

    // Fetch only the avatar/cover relations rather than draining the entity's
    // entire relation set (`getEntity`), and only for the ones not already in
    // the store. These reuse the same cache keys as the single-purpose hooks
    // above, so all media hooks for one entity dedupe onto shared requests.
    const id = entityId;

    const fetchMedia = async () => {
      try {
        const [avatarRelations, coverRelations] = await Promise.all([
          storeAvatarUrl
            ? Promise.resolve([])
            : cache.fetchQuery({
                queryKey: ['network', 'relations-by-property', id, ContentIds.AVATAR_PROPERTY, spaceId],
                queryFn: ({ signal }) =>
                  Effect.runPromise(getRelationsByFromEntityId(id, ContentIds.AVATAR_PROPERTY, spaceId, signal)),
                staleTime: 5 * 60 * 1000,
              }),
          storeCoverUrl
            ? Promise.resolve([])
            : cache.fetchQuery({
                queryKey: ['network', 'relations-by-property', id, SystemIds.COVER_PROPERTY, spaceId],
                queryFn: ({ signal }) =>
                  Effect.runPromise(getRelationsByFromEntityId(id, SystemIds.COVER_PROPERTY, spaceId, signal)),
                staleTime: 5 * 60 * 1000,
              }),
        ]);

        const avatarUrl = avatarRelations[0]?.toEntity.value;
        if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('ipfs://')) {
          setFetchedAvatarUrl(avatarUrl);
        }

        const coverUrl = coverRelations[0]?.toEntity.value;
        if (coverUrl && typeof coverUrl === 'string' && coverUrl.startsWith('ipfs://')) {
          setFetchedCoverUrl(coverUrl);
        }
      } catch {
        // ignored — entity may not exist
      }
    };

    fetchMedia();
  }, [entityId, spaceId, storeAvatarUrl, storeCoverUrl, cache]);

  return {
    avatarUrl: storeAvatarUrl ?? fetchedAvatarUrl,
    coverUrl: storeCoverUrl ?? fetchedCoverUrl,
  };
}

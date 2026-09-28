'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getRelationsByFromEntityId } from '~/core/io/queries';
import { useRelation, useValues } from '~/core/sync/use-store';
import { findMediaUrlValue, isDirectMediaUrl } from '~/core/utils/media-url';

// Re-exported from its old home: the readers that hold values straight off a
// GraphQL response need it too, and they have no business pulling in the store.
export { findMediaUrlValue };

export function useImageUrlFromEntity(imageEntityId: string | undefined, spaceId: string): string | undefined {
  const imageValues = useValues({
    selector: v => v.entity.id === imageEntityId && v.spaceId === spaceId,
  });

  if (!imageEntityId || imageValues.length === 0) return undefined;

  return findMediaUrlValue(imageValues);
}

export function useVideoUrlFromEntity(videoEntityId: string | undefined, spaceId: string): string | undefined {
  const videoValues = useValues({
    selector: v => v.entity.id === videoEntityId && v.spaceId === spaceId,
  });

  if (!videoEntityId || videoValues.length === 0) return undefined;

  return findMediaUrlValue(videoValues);
}

/**
 * True when this entity's relation for `propertyId` survives only as a local
 * deletion. The fetched fallback in the hooks below is cached for five minutes and
 * outlives the relation disappearing, so without this a removed image keeps
 * rendering from that cache — and comes back the next time a view reopens.
 */
function useIsLocallyRemoved(entityId: string | undefined, propertyId: string, spaceId: string, hasLive: boolean) {
  const deleted = useRelation({
    includeDeleted: true,
    selector: r =>
      r.fromEntity.id === entityId && r.type.id === propertyId && r.spaceId === spaceId && r.isDeleted === true,
  });

  return Boolean(deleted) && !hasLive;
}

export function useEntityAvatarUrl(entityId: string | undefined, spaceId: string): string | undefined {
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = React.useState<string | undefined>(undefined);
  const cache = useQueryClient();

  const storeAvatarRelation = useRelation({
    selector: r => r.fromEntity.id === entityId && r.type.id === ContentIds.AVATAR_PROPERTY && r.spaceId === spaceId,
  });

  const storeAvatarEntityId = storeAvatarRelation?.toEntity.id;
  const storeImageUrl = useImageUrlFromEntity(storeAvatarEntityId, spaceId);
  const isRemoved = useIsLocallyRemoved(entityId, ContentIds.AVATAR_PROPERTY, spaceId, Boolean(storeAvatarRelation));

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
        if (typeof imageUrl === 'string' && isDirectMediaUrl(imageUrl)) {
          setFetchedAvatarUrl(imageUrl);
        }
      } catch {
        // ignored — entity may not exist
      }
    };

    fetchAvatar();
  }, [entityId, spaceId, storeImageUrl, cache]);

  if (isRemoved) return undefined;

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
  const isRemoved = useIsLocallyRemoved(entityId, SystemIds.COVER_PROPERTY, spaceId, Boolean(storeCoverRelation));

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
        if (typeof imageUrl === 'string' && isDirectMediaUrl(imageUrl)) {
          setFetchedCoverUrl(imageUrl);
        }
      } catch {
        // ignored — entity may not exist
      }
    };

    fetchCover();
  }, [entityId, spaceId, storeImageUrl, cache]);

  if (isRemoved) return undefined;

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
): {
  avatarUrl: string | undefined;
  coverUrl: string | undefined;
  /**
   * True while the avatar/cover relations are still being fetched. Until it clears, two
   * undefined URLs mean "we don't know yet", not "this entity has no image" — callers that
   * swap in a placeholder need to tell those apart or they flash it on every card.
   */
  isResolving: boolean;
} {
  // Keyed by what it was fetched for, not held as bare URLs. Point the hook at a different
  // entity and the previous one's results have to stop counting — otherwise the old image stays
  // on screen, and because a URL is present `isResolving` reads false, so nothing ever corrects
  // it if the new entity has no image of its own.
  const [fetched, setFetched] = React.useState<{
    key: string;
    avatarUrl: string | undefined;
    coverUrl: string | undefined;
  } | null>(null);
  const cache = useQueryClient();

  const fetchKey = `${entityId ?? ''}:${spaceId}`;
  const settled = fetched?.key === fetchKey ? fetched : null;

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

  // Same guard as the single-purpose hooks above. Without it here, the surfaces
  // that use this one — ranking rows, block media — keep serving an image from the
  // five-minute relation cache after it has been removed.
  const isAvatarRemoved = useIsLocallyRemoved(
    entityId,
    ContentIds.AVATAR_PROPERTY,
    spaceId,
    Boolean(storeAvatarRelation)
  );
  const isCoverRemoved = useIsLocallyRemoved(entityId, SystemIds.COVER_PROPERTY, spaceId, Boolean(storeCoverRelation));

  React.useEffect(() => {
    if (!entityId || (storeAvatarUrl && storeCoverUrl)) {
      return;
    }

    // Fetch only the avatar/cover relations rather than draining the entity's
    // entire relation set (`getEntity`), and only for the ones not already in
    // the store. These reuse the same cache keys as the single-purpose hooks
    // above, so all media hooks for one entity dedupe onto shared requests.
    const id = entityId;
    const key = `${id}:${spaceId}`;

    // Requests for an entity we've since moved off must not land. Whoever finishes last would
    // otherwise win, and a late reply for the *previous* entity overwrites the current one's
    // result with a key that no longer matches — leaving it stranded, since `settled` reads as
    // null and the effect has no reason to run again.
    let cancelled = false;

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

        if (cancelled) return;

        const avatarUrl = avatarRelations[0]?.toEntity.value;
        const coverUrl = coverRelations[0]?.toEntity.value;

        setFetched({
          key,
          avatarUrl: asImageUrl(avatarUrl),
          coverUrl: asImageUrl(coverUrl),
        });
      } catch {
        // Ignored — the entity may not exist. Still record the attempt: a caller waiting on
        // `isResolving` would otherwise hold its loading state forever.
        if (cancelled) return;
        setFetched({ key, avatarUrl: undefined, coverUrl: undefined });
      }
    };

    fetchMedia();

    return () => {
      cancelled = true;
    };
  }, [entityId, spaceId, fetchKey, storeAvatarUrl, storeCoverUrl, cache]);

  const avatarUrl = isAvatarRemoved ? undefined : (storeAvatarUrl ?? settled?.avatarUrl);
  const coverUrl = isCoverRemoved ? undefined : (storeCoverUrl ?? settled?.coverUrl);

  return {
    avatarUrl,
    coverUrl,
    isResolving: Boolean(entityId) && !avatarUrl && !coverUrl && settled === null,
  };
}

function asImageUrl(value: unknown): string | undefined {
  return typeof value === 'string' && isDirectMediaUrl(value) ? value : undefined;
}

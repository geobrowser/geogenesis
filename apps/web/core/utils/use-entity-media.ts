'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { ID } from '~/core/id';
import { getRelationsByFromEntityId } from '~/core/io/queries';
import { useRelation, useValues } from '~/core/sync/use-store';
import { isDirectMediaUrl } from '~/core/utils/media-url';

/**
 * The media URL among an image/video entity's values.
 *
 * `ipfs://` is accepted from any value, and preferred: legacy media blocks keep the URI on an
 * unlabelled value, and pre-existing pinned media must resolve exactly as before. An http(s) URL
 * is accepted only from `Web URL` — media left in object storage is published there — because
 * `Web URL` is also the general-purpose canonical-link property, and the callers of this helper
 * gate on the *property* being image-typed, never on the target entity. Scanning every value
 * would turn an article's source link into a broken image the moment someone pointed an Avatar
 * relation at it.
 */
export function findMediaUrlValue(values: { value: unknown; property: { id: string } }[]): string | undefined {
  const ipfsValue = values.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));
  if (typeof ipfsValue?.value === 'string') return ipfsValue.value;
  const webUrlValue = values.find(
    v =>
      ID.equals(v.property.id, ContentIds.WEB_URL_PROPERTY) && typeof v.value === 'string' && isDirectMediaUrl(v.value)
  );
  return typeof webUrlValue?.value === 'string' ? webUrlValue.value : undefined;
}

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
        if (typeof imageUrl === 'string' && isDirectMediaUrl(imageUrl)) {
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
        if (typeof imageUrl === 'string' && isDirectMediaUrl(imageUrl)) {
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

  const avatarUrl = storeAvatarUrl ?? settled?.avatarUrl;
  const coverUrl = storeCoverUrl ?? settled?.coverUrl;

  return {
    avatarUrl,
    coverUrl,
    isResolving: Boolean(entityId) && !avatarUrl && !coverUrl && settled === null,
  };
}

function asImageUrl(value: unknown): string | undefined {
  return typeof value === 'string' && isDirectMediaUrl(value) ? value : undefined;
}

'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useRelations } from '~/core/sync/use-store';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { EditableCoverAvatarHeader } from './editable-entity-cover-avatar-header';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
};

/**
 * Resolves the image URL from a relation, with fallback to server-rendered value.
 *
 * Before the store has synced, the relation won't exist yet. We use the
 * server-rendered URL so the page doesn't flash from "no image" to "has image"
 * once the store loads. Once the store has produced a relation for this property,
 * we switch to the store as the source of truth (so deletions work correctly).
 */
function useImageUrl(entityId: string, spaceId: string, propertyId: string, serverUrl: string | null) {
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === propertyId && r.spaceId === spaceId,
  });

  const relation = relations[0];
  const relatedEntityId = relation?.toEntity.id;
  const relatedValue = relation?.toEntity.value;
  const imageUrl = useImageUrlFromEntity(relatedEntityId, spaceId);

  // Once the store has a relation, it's the source of truth
  const hasSeenRelation = React.useRef(false);
  if (relation) {
    hasSeenRelation.current = true;
  }

  // Store has never had this relation — use server value (store may not have synced yet)
  if (!relation && !hasSeenRelation.current) {
    return serverUrl;
  }

  // Store synced but relation was removed (user deleted it)
  if (!relation && hasSeenRelation.current) {
    return null;
  }

  if (imageUrl) {
    return imageUrl;
  }

  if (relatedValue && (relatedValue.startsWith('ipfs://') || relatedValue.startsWith('http'))) {
    return relatedValue;
  }

  return serverUrl;
}

export const EntityPageCover = ({ avatarUrl: serverAvatarUrl, coverUrl: serverCoverUrl }: EntityPageCoverProps) => {
  const { id, spaceId } = useEntityStoreInstance();

  const avatarUrl = useImageUrl(id, spaceId, ContentIds.AVATAR_PROPERTY, serverAvatarUrl);
  const coverUrl = useImageUrl(id, spaceId, SystemIds.COVER_PROPERTY, serverCoverUrl);

  return <EditableCoverAvatarHeader avatarUrl={avatarUrl} coverUrl={coverUrl} />;
};

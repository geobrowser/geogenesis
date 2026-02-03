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

function useAvatarUrl(entityId: string, spaceId: string, serverAvatarUrl: string | null) {
  const avatarRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === ContentIds.AVATAR_PROPERTY && r.spaceId === spaceId,
  });

  const avatarRelation = avatarRelations[0];
  const avatarEntityId = avatarRelation?.toEntity.id;
  const avatarValue = avatarRelation?.toEntity.value;
  const imageUrl = useImageUrlFromEntity(avatarEntityId, spaceId);

  if (!avatarRelation) {
    return null;
  }

  // Use the looked-up image URL first, then fall back to toEntity.value only if it's a valid URL format
  if (imageUrl) {
    return imageUrl;
  }

  if (avatarValue && (avatarValue.startsWith('ipfs://') || avatarValue.startsWith('http'))) {
    return avatarValue;
  }

  return serverAvatarUrl;
}

function useCoverUrl(entityId: string, spaceId: string, serverCoverUrl: string | null) {
  const coverRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === SystemIds.COVER_PROPERTY && r.spaceId === spaceId,
  });

  const coverRelation = coverRelations[0];
  const coverEntityId = coverRelation?.toEntity.id;
  const coverValue = coverRelation?.toEntity.value;
  const imageUrl = useImageUrlFromEntity(coverEntityId, spaceId);

  if (!coverRelation) {
    return null;
  }

  // Use the looked-up image URL first, then fall back to toEntity.value only if it's a valid URL format
  if (imageUrl) {
    return imageUrl;
  }

  if (coverValue && (coverValue.startsWith('ipfs://') || coverValue.startsWith('http'))) {
    return coverValue;
  }

  return serverCoverUrl;
}

export const EntityPageCover = ({ avatarUrl: serverAvatarUrl, coverUrl: serverCoverUrl }: EntityPageCoverProps) => {
  const { id, spaceId } = useEntityStoreInstance();

  const avatarUrl = useAvatarUrl(id, spaceId, serverAvatarUrl);
  const coverUrl = useCoverUrl(id, spaceId, serverCoverUrl);

  return <EditableCoverAvatarHeader avatarUrl={avatarUrl} coverUrl={coverUrl} />;
};

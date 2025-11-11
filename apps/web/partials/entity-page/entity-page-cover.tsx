'use client';

import * as React from 'react';

import { ContentIds, SystemIds } from '@graphprotocol/grc-20';

import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useRelations } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { useImageUrlFromEntity } from '~/core/utils/utils';

import { EditableCoverAvatarHeader } from './editable-entity-cover-avatar-header';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
};

function useAvatarUrl(entityId: string, spaceId: string, serverAvatarUrl: string | null) {
  const avatarRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === ContentIds.AVATAR_PROPERTY && r.spaceId === spaceId,
  });

  const avatarEntityId = Entities.avatar(avatarRelations);
  const imageUrl = useImageUrlFromEntity(avatarEntityId || undefined, spaceId);

  if (!avatarEntityId) {
    return null;
  }

  return imageUrl || avatarEntityId || serverAvatarUrl;
}

function useCoverUrl(entityId: string, spaceId: string, serverCoverUrl: string | null) {
  const coverRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === SystemIds.COVER_PROPERTY && r.spaceId === spaceId,
  });

  const coverEntityId = Entities.cover(coverRelations);
  const imageUrl = useImageUrlFromEntity(coverEntityId || undefined, spaceId);

  if (!coverEntityId) {
    return null;
  }

  return imageUrl || coverEntityId || serverCoverUrl;
}

export const EntityPageCover = ({ avatarUrl: serverAvatarUrl, coverUrl: serverCoverUrl }: EntityPageCoverProps) => {
  const { id, spaceId } = useEntityStoreInstance();

  const avatarUrl = useAvatarUrl(id, spaceId, serverAvatarUrl);
  const coverUrl = useCoverUrl(id, spaceId, serverCoverUrl);

  return <EditableCoverAvatarHeader avatarUrl={avatarUrl} coverUrl={coverUrl} />;
};

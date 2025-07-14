'use client';

import * as React from 'react';

import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useRelations } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';

import { EditableCoverAvatarHeader } from './editable-entity-cover-avatar-header';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
};

export const EntityPageCover = ({ avatarUrl: serverAvatarUrl, coverUrl: serverCoverUrl }: EntityPageCoverProps) => {
  const { id, spaceId } = useEntityStoreInstance();

  const relations = useRelations({
    selector: r => r.fromEntity.id === id && r.spaceId === spaceId,
  });

  const avatarUrl = Entities.avatar(relations) ?? serverAvatarUrl;
  const coverUrl = Entities.cover(relations) ?? serverCoverUrl;

  return <EditableCoverAvatarHeader avatarUrl={avatarUrl} coverUrl={coverUrl} />;
};

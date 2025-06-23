'use client';

import * as React from 'react';

import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Entities } from '~/core/utils/entity';

import { EditableCoverAvatarHeader } from './editable-entity-cover-avatar-header';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
};

export const EntityPageCover = ({ avatarUrl: serverAvatarUrl, coverUrl: serverCoverUrl }: EntityPageCoverProps) => {
  const { relations } = useEntityPageStore();

  const avatarUrl = Entities.avatar(relations) ?? serverAvatarUrl;
  const coverUrl = Entities.cover(relations) ?? serverCoverUrl;

  return <EditableCoverAvatarHeader avatarUrl={avatarUrl} coverUrl={coverUrl} />;
};

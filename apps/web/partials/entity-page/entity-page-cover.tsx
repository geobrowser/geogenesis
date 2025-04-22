'use client';

import cx from 'classnames';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';

import EditableCoverAvatarHeader from './editable-entity-cover-avatar-header';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
  triples?: Triple[];
};

export const EntityPageCover = ({
  avatarUrl: serverAvatarUrl,
  coverUrl: serverCoverUrl,
  triples,
}: EntityPageCoverProps) => {
  const { relations, spaceId } = useEntityPageStore();

  const editable = useUserIsEditing(spaceId);

  const avatarUrl = Entities.avatar(relations) ?? serverAvatarUrl;
  const coverUrl = Entities.cover(relations) ?? serverCoverUrl;

  if (editable) return <EditableCoverAvatarHeader avatarUrl={avatarUrl} triples={triples} coverUrl={coverUrl} />;

  if (coverUrl) {
    return (
      <div className={cx('relative mx-auto -mt-6 h-[320px] w-full max-w-[1192px]', avatarUrl ? 'mb-20' : 'mb-8')}>
        <div className="relative h-full w-full overflow-hidden rounded-lg bg-grey-01">
          <Image
            src={getImagePath(coverUrl)}
            layout="fill"
            objectFit="cover"
            priority
            className="h-full w-full"
            alt=""
          />
        </div>
        {avatarUrl && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="mx-auto w-full max-w-[880px]">
              <div className="relative h-[80px] w-[80px] translate-y-1/2 overflow-hidden rounded-lg border border-white bg-grey-01 shadow-lg">
                <Image
                  src={getImagePath(avatarUrl)}
                  layout="fill"
                  objectFit="cover"
                  priority
                  className="h-full w-full"
                  alt=""
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (avatarUrl) {
    return (
      <div className="mx-auto mb-10 w-[880px]">
        <div className="relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-white bg-grey-01 shadow-lg">
          <Image src={getImagePath(avatarUrl)} layout="fill" objectFit="cover" className="h-full w-full" alt="" />
        </div>
      </div>
    );
  }

  return null;
};

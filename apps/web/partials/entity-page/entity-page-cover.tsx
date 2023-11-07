'use client';

import cx from 'classnames';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { Entity } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
  space?: boolean;
};

export const EntityPageCover = ({
  avatarUrl: serverAvatarUrl,
  coverUrl: serverCoverUrl,
  space = false,
}: EntityPageCoverProps) => {
  const { triples } = useEntityPageStore();

  const avatarUrl = Entity.avatar(triples) ?? serverAvatarUrl;
  const coverUrl = Entity.cover(triples) ?? serverCoverUrl;

  if (!coverUrl && !avatarUrl) return null;

  if (coverUrl) {
    return (
      <div className={cx('relative mx-auto h-[320px] w-full max-w-[1192px]', !space && avatarUrl ? 'mb-20' : 'mb-8')}>
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
        {!space && avatarUrl && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="mx-auto w-full max-w-[784px]">
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

  if (!space && avatarUrl) {
    return (
      <div className="mx-auto mb-10 w-[784px]">
        <div className="relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-white bg-grey-01 shadow-lg">
          <Image src={getImagePath(avatarUrl)} layout="fill" objectFit="cover" className="h-full w-full" alt="" />
        </div>
      </div>
    );
  }

  return null;
};

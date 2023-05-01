import * as React from 'react';
import cx from 'classnames';
import Image from 'next/image';

type EntityPageCoverProps = {
  avatarUrl: string | null;
  coverUrl: string | null;
  space?: boolean;
};

export const EntityPageCover = ({ avatarUrl, coverUrl, space = false }: EntityPageCoverProps) => {
  if (!coverUrl && !avatarUrl) return null;

  if (coverUrl) {
    return (
      <div className={cx('relative mx-auto h-[320px] w-full max-w-[1192px]', !space && avatarUrl ? 'mb-20' : 'mb-8')}>
        <div className="relative h-full w-full overflow-hidden rounded bg-grey-01">
          <Image src={coverUrl} layout="fill" objectFit="cover" priority className="h-full w-full" alt="" />
        </div>
        {!space && avatarUrl && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="mx-auto w-full max-w-[784px]">
              <div className="relative h-[80px] w-[80px] translate-y-1/2 overflow-hidden rounded border border-white bg-grey-01 shadow-lg">
                <Image src={avatarUrl} layout="fill" objectFit="cover" priority className="h-full w-full" alt="" />
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
        <div className="relative h-[80px] w-[80px] overflow-hidden rounded border border-white bg-grey-01 shadow-lg">
          <Image src={avatarUrl} layout="fill" objectFit="cover" className="h-full w-full" alt="" />
        </div>
      </div>
    );
  }

  return null;
};

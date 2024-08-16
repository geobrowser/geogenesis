'use client';

import cx from 'classnames';
import Image from 'next/image';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getImagePath } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { SpaceData } from '~/app/space/[id]/spaces/page';

type SpacesProps = {
  spaces: Array<SpaceData>;
};

export const Spaces = ({ spaces }: SpacesProps) => {
  return (
    <div className="grid grid-cols-3 gap-x-8 gap-y-10">
      {spaces.map(space => (
        <Link key={space.id} href={`/space/${space.id}`} className="group flex flex-col gap-3">
          <div className="relative aspect-[2/1] w-full overflow-clip rounded-lg bg-grey-01">
            <Image
              src={getImagePath(space.image || PLACEHOLDER_SPACE_IMAGE)}
              className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
              alt=""
              fill
            />
          </div>
          <div className={cx('truncate text-tableCell font-medium', space.name ? 'text-text' : 'text-grey-03')}>
            {space.name || 'No space name'}
          </div>
        </Link>
      ))}
    </div>
  );
};

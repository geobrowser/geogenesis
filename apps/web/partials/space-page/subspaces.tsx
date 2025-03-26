'use client';

import Image from 'next/legacy/image';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Subspace } from '~/core/io/dto/subspaces';
import { useTabId } from '~/core/state/editor/use-editor';
import { getImagePath } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Slider } from '~/design-system/slider';
import { Spacer } from '~/design-system/spacer';

type SubspacesProps = {
  subspaces: Subspace[];
};

export const Subspaces = ({ subspaces }: SubspacesProps) => {
  const tabId = useTabId();

  if (tabId) return null;

  return (
    <>
      <Slider label="Subspaces">
        {subspaces.map((subspace, index) => {
          const href = `/space/${subspace.id}`;
          const image = subspace.spaceConfig?.image ?? PLACEHOLDER_SPACE_IMAGE;

          return (
            <Link key={index} href={href} className="group">
              <div className="relative aspect-[16/9] w-full overflow-clip rounded-lg bg-grey-01">
                <Image
                  src={getImagePath(image)}
                  className="transition-transform duration-150 ease-in-out group-hover:scale-105"
                  objectFit="cover"
                  priority
                  layout="fill"
                  alt=""
                />
              </div>
              <div className="mt-2 text-smallTitle font-medium text-text">{subspace.spaceConfig?.name}</div>
            </Link>
          );
        })}
      </Slider>
      <Spacer height={40} />
    </>
  );
};

'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/image';
import Link from 'next/link';

import { useSpaces } from '~/core/hooks/use-spaces';

// import { Member } from '~/design-system/icons/member';
import { Slider } from '~/design-system/slider';
import { Spacer } from '~/design-system/spacer';

type SubspacesProps = {
  subspaces: any[];
};

export const Subspaces = ({ subspaces }: SubspacesProps) => {
  const { spaces } = useSpaces();

  if (subspaces.length === 0) return null;

  return (
    <>
      <Slider label="Subspaces">
        {subspaces.map((subspace, index) => {
          const space = spaces.find(space => space.spaceConfig?.id === subspace.id);

          if (!space) return null;

          const href = `/space/${space.id}`;
          const src = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? '/placeholder.png';

          return (
            <Link key={index} href={href} className="group">
              <div className="relative aspect-[16/9] w-full overflow-clip rounded-lg bg-grey-01">
                <Image
                  src={src}
                  className="transition-transform duration-150 ease-in-out group-hover:scale-105"
                  objectFit="cover"
                  priority
                  layout="fill"
                  alt=""
                />
              </div>
              <div className="mt-2 text-metadataMedium text-text">{subspace.name}</div>
              {/* <div className="mt-1 flex items-center gap-1 text-smallButton text-grey-03">
                <div className="scale-[0.8]">
                  <Member />
                </div>
                <span>445</span>
              </div> */}
            </Link>
          );
        })}
      </Slider>
      <Spacer height={40} />
    </>
  );
};

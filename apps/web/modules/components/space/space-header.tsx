import * as React from 'react';
import Image from 'next/image';

import { Text } from '~/modules/design-system/text';
import { ZERO_WIDTH_SPACE } from '../../constants';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
}

export function SpaceHeader({ spaceImage, spaceName = ZERO_WIDTH_SPACE }: Props) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-5">
        <div className="rounded-lg relative hidden h-14 w-14">
          <Image
            objectFit="cover"
            layout="fill"
            src={spaceImage ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF'}
            alt={`Cover image for ${spaceName}`}
          />
        </div>
        <Text variant="mainPage" as="h1">
          {spaceName}
        </Text>
      </div>
    </div>
  );
}

'use client';

import { Space } from '~/core/io/dto/spaces';

import { Generate } from './generate';
import { Publish } from './publish';

type ImportProps = {
  spaceId: string;
  space: Space;
};

export const Import = ({ spaceId, space }: ImportProps) => {
  return (
    <>
      <Generate spaceId={spaceId} space={space} />
      <Publish spaceId={spaceId} space={space} />
    </>
  );
};

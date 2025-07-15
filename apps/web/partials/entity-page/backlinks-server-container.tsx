import { Effect } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getEntityBacklinks, getSpaces } from '~/core/io/v2/queries';

import { Backlinks } from '~/partials/entity-page/backlinks';

type BacklinksServerContainerProps = {
  entityId: string;
};

export const BacklinksServerContainer = async ({ entityId }: BacklinksServerContainerProps) => {
  const backlinksData = await Effect.runPromise(getEntityBacklinks(entityId));

  if (backlinksData.length === 0) return null;

  const allSpaceIds = Array.from(new Set(backlinksData.flatMap(backlink => backlink.spaceIds)));

  const spacesData: Space[] =
    allSpaceIds.length > 0 ? await Effect.runPromise(getSpaces({ spaceIds: allSpaceIds })) : [];

  const backlinks = backlinksData.flatMap(backlink => {
    if (!backlink.name || !backlink.spaceIds || backlink.spaceIds.length === 0) return [];

    const primarySpaceId = backlink.spaceIds[0];
    const spaceData = spacesData.find(space => space.id === primarySpaceId);

    if (!spaceData) return [];

    const primarySpace = {
      id: spaceData.id,
      entity: {
        name: spaceData.entity.name || '',
        image: spaceData.entity.image,
      },
    };

    return [
      {
        ...backlink,
        primarySpace,
      },
    ];
  });

  return <Backlinks backlinks={backlinks} />;
};

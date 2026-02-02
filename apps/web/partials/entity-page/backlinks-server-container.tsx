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

  // Collect all backlink space IDs to fetch space data
  const allSpaceIds = Array.from(new Set(backlinksData.map(backlink => backlink.backlinkSpaceId)));

  const spacesData: Space[] =
    allSpaceIds.length > 0 ? await Effect.runPromise(getSpaces({ spaceIds: allSpaceIds })) : [];

  const backlinks = backlinksData.flatMap(backlink => {
    if (!backlink.name || !backlink.backlinkSpaceId) return [];

    const spaceData = spacesData.find(space => space.id === backlink.backlinkSpaceId);

    if (!spaceData) return [];

    const primarySpace = {
      id: spaceData.id,
      entity: {
        name: spaceData.entity.name || '',
        image: spaceData.entity.image,
      },
    };

    // Filter types to only show those from the backlink's space, then deduplicate by id
    const typesFromBacklinkSpace = backlink.types.filter(t => t.spaceIds?.includes(backlink.backlinkSpaceId));
    const uniqueTypes = Array.from(new Map(typesFromBacklinkSpace.map(t => [t.id, t])).values());

    return [
      {
        ...backlink,
        types: uniqueTypes,
        primarySpace,
      },
    ];
  });

  return <Backlinks backlinks={backlinks} />;
};

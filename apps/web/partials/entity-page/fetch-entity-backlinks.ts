import { Effect } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getEntityBacklinks, getSpaces } from '~/core/io/queries';
import { compareBySpaceRank } from '~/core/utils/space/space-ranking';

import type { Backlink } from '~/partials/entity-page/backlinks';

export async function fetchEntityBacklinksPayload(entityId: string): Promise<Backlink[]> {
  const backlinksData = await Effect.runPromise(getEntityBacklinks(entityId));

  if (backlinksData.length === 0) return [];

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

    const uniqueTypes = Array.from(new Map(backlink.types.map(t => [t.id, t])).values());

    return [
      {
        ...backlink,
        types: uniqueTypes,
        primarySpace,
      },
    ];
  });

  backlinks.sort(compareBySpaceRank(b => b.primarySpace.id));

  return backlinks;
}

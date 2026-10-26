import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { firstLine } from '~/core/opengraph';
import { Entities } from '~/core/utils/entity';

import { cachedFetchSpace } from '../cached-fetch-space';

/**
 * The space's own title and description, for every route that shows the space's home page.
 *
 * Page metadata is per route and not inherited by siblings, so the bare URL and a topic space's
 * `/overview` each export a `generateMetadata` that calls this.
 */
export async function generateSpaceMetadata(spaceId: string): Promise<Metadata> {
  if (!IdUtils.isValid(spaceId)) {
    return { title: 'Not Found' };
  }

  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      title: `Space ${spaceId}`,
      description: 'No entity found for this space.',
    };
  }

  const entityName = entity.name ?? null;
  const description = firstLine(Entities.description(entity.values ?? []));

  return {
    title: entityName ?? spaceId,
    description,
  };
}

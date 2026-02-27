import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generateOgImage } from '~/core/opengraph';
import { Entities } from '~/core/utils/entity';

import { cachedFetchSpace } from './cached-fetch-space';

export const alt = 'Geo Genesis';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;
export const revalidate = 86400;

type Props = { params: Promise<{ id: string }> };

export default async function Image({ params }: Props) {
  const { id } = await params;
  const space = await cachedFetchSpace(id);
  const entity = space?.entity;
  const imageUrl = Entities.cover(entity?.relations) ?? Entities.avatar(entity?.relations);
  return generateOgImage(imageUrl ?? undefined);
}

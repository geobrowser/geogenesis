import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generateOgImage } from '~/core/opengraph';
import { Entities } from '~/core/utils/entity';

import { cachedFetchEntityPage } from './cached-fetch-entity';

export const alt = 'Geo Genesis';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;
export const revalidate = 86400;

type Props = { params: Promise<{ id: string; entityId: string }> };

export default async function Image({ params }: Props) {
  const { id, entityId } = await params;
  const result = await cachedFetchEntityPage(entityId, id);
  const entity = result?.entity;
  const imageUrl = Entities.cover(entity?.relations) ?? Entities.avatar(entity?.relations);
  return generateOgImage(imageUrl ?? undefined);
}

import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { fetchDebateVisibility } from '~/core/debates/server/debate-visibility';
import { isHiddenEntity } from '~/core/moderation/hidden';
import { ogShareImageSrc } from '~/core/og-share-image';
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generateOgImage } from '~/core/opengraph';

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
  // A withheld entity gets the generic card, never its own key frame. The page already
  // 404s (GEO-2809), but this route renders independently of it — a hidden debate's link
  // still unfurled in Slack with its video still attached.
  if (isHiddenEntity(entity)) {
    return generateOgImage(ogShareImageSrc(undefined));
  }
  // Likewise a debate geo-chat reports removed (GEO-2785). Read with a short revalidate, since
  // this route is itself statically revalidated.
  if (
    isDebateEntity(entity?.types) &&
    (await fetchDebateVisibility(entityId, { revalidateSeconds: 300 })) === 'removed'
  ) {
    return generateOgImage(ogShareImageSrc(undefined));
  }
  return generateOgImage(ogShareImageSrc(entity?.relations));
}

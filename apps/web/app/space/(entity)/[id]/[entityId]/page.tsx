import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { ENTITY_PAGE_SURFACE_POST_VALUE, ENTITY_PAGE_SURFACE_QUERY_KEY } from '~/partials/entity-page/entity-page-surface';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';
import PostEntityPage from './post-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EntityTemplateStrategy(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) {
    notFound();
  }

  const result = await cachedFetchEntityPage(params.entityId, params.id);

  if (result?.entity?.types.map(t => t.id).includes(SystemIds.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} searchParams={searchParams} />;
  }

  const typeIds = result?.entity?.types.map(t => t.id) ?? [];
  const rawSurface = searchParams[ENTITY_PAGE_SURFACE_QUERY_KEY];
  const surfaceHint =
    typeof rawSurface === 'string' ? rawSurface : Array.isArray(rawSurface) ? rawSurface[0] : undefined;

  const isPostEntity =
    typeIds.includes(SystemIds.POST_TYPE) ||
    (typeIds.length === 0 && surfaceHint === ENTITY_PAGE_SURFACE_POST_VALUE);

  if (isPostEntity) {
    return <PostEntityPage params={params} searchParams={searchParams} />;
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}

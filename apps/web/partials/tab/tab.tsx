import { SYSTEM_IDS } from '@geogenesis/ids';

import { Subgraph } from '~/core/io';

import { EmptyEntityPage } from '~/partials/tab/empty-entity-page';

import DefaultEntityPage from '~/app/space/(entity)/[id]/[entityId]/default-entity-page';

export type Props = {
  params: { id: string };
  searchParams: {
    typeId?: string;
    filters?: string;
  };
};

export const Tab = async (props: Props & { slug: string }) => {
  const { slug, searchParams } = props;
  const spaceId = props.params.id;
  const pageTypeId = getPageTypeId(slug);

  if (!spaceId || !pageTypeId) return null;

  const entityId = await getEntityId(spaceId, pageTypeId);

  if (!entityId) {
    return <EmptyEntityPage slug={slug} spaceId={spaceId} pageTypeId={pageTypeId} />;
  }

  const params = {
    id: spaceId,
    entityId,
  };

  return (
    <DefaultEntityPage
      params={params}
      searchParams={searchParams}
      showCover={false}
      showHeading={false}
      showHeader={false}
    />
  );
};

const getPageTypeId = (slug: string): string | null => {
  return pageTypeIds?.[slug] ?? null;
};

const pageTypeIds: Record<string, string> = {
  posts: SYSTEM_IDS.POSTS_PAGE,
  products: SYSTEM_IDS.PRODUCTS_PAGE,
  services: SYSTEM_IDS.SERVICES_PAGE,
  events: SYSTEM_IDS.EVENTS_PAGE,
  jobs: SYSTEM_IDS.JOBS_PAGE,
  projects: SYSTEM_IDS.PROJECTS_PAGE,
  finances: SYSTEM_IDS.FINANCES_PAGE,
  spaces: SYSTEM_IDS.SPACES_PAGE,
};

const getEntityId = async (spaceId: string, pageTypeId: string) => {
  const pageTypeTriples = await Subgraph.fetchTriples({
    space: spaceId,
    query: '',
    skip: 0,
    first: 1000,
    filter: [{ field: 'attribute-id', value: SYSTEM_IDS.PAGE_TYPE_TYPE }],
  });

  const entityId = pageTypeTriples.find(triple => triple.value.id === pageTypeId)?.entityId;

  return entityId ?? null;
};

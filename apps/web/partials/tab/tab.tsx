import { SYSTEM_IDS } from '@geogenesis/sdk';

import type { ReactNode } from 'react';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';

import { EmptyTab } from '~/partials/tab/empty-tab';

import DefaultEntityPage from '~/app/space/(entity)/[id]/[entityId]/default-entity-page';

type TabProps = {
  params: { id: string };
  slug: string;
  notice?: ReactNode;
};

export const Tab = async (props: TabProps) => {
  const { slug } = props;
  const spaceId = props.params.id;
  const pageTypeId = getPageTypeId(slug);

  if (!spaceId || !pageTypeId) return null;

  const entityId = await getEntityId(spaceId, pageTypeId);

  if (!entityId) {
    const newEntityId = ID.createEntityId();

    const newParams = {
      id: spaceId,
      entityId: newEntityId,
    };

    return (
      <EmptyTab spaceId={spaceId}>
        <DefaultEntityPage params={newParams} showCover={false} showHeading={false} showHeader={false} />
      </EmptyTab>
    );
  }

  const params = {
    id: spaceId,
    entityId,
  };

  const { notice } = props;

  return <DefaultEntityPage params={params} showCover={false} showHeading={false} showHeader={false} notice={notice} />;
};

const getPageTypeId = (slug: string): string | null => {
  return pageTypeIds?.[slug] ?? null;
};

const pageTypeIds: Record<string, string> = {
  posts: SYSTEM_IDS.POSTS_PAGE,
  products: SYSTEM_IDS.PRODUCTS_PAGE,
  services: SYSTEM_IDS.SERVICES_PAGE,
  events: SYSTEM_IDS.EVENTS_PAGE,
  team: SYSTEM_IDS.TEAM_PAGE,
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

  const entityId = pageTypeTriples.find(triple => triple.value.value === pageTypeId)?.entityId;
  return entityId ?? null;
};

import { SYSTEM_IDS } from '@geogenesis/sdk';

import type { ReactNode } from 'react';

import { ID } from '~/core/id';
import { fetchTabEntityId } from '~/core/io/subgraph/fetch-tab';

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
  const pageTypeEntityId = getPageTypeEntityId(slug);

  if (!spaceId || !pageTypeEntityId) return null;

  const entityId = await fetchTabEntityId({
    spaceId,
    pageTypeEntityId,
  });

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

const getPageTypeEntityId = (slug: string): string | null => {
  return pageTypeEntityIds?.[slug] ?? null;
};

const pageTypeEntityIds: Record<string, string> = {
  about: SYSTEM_IDS.ABOUT_PAGE,
  education: SYSTEM_IDS.EDUCATION_PAGE,
  events: SYSTEM_IDS.EVENTS_PAGE,
  finances: SYSTEM_IDS.FINANCES_PAGE,
  jobs: SYSTEM_IDS.JOBS_PAGE,
  ontology: SYSTEM_IDS.ONTOLOGY_PAGE,
  news: SYSTEM_IDS.NEWS_PAGE,
  people: SYSTEM_IDS.PEOPLE_PAGE,
  posts: SYSTEM_IDS.POSTS_PAGE,
  products: SYSTEM_IDS.PRODUCTS_PAGE,
  projects: SYSTEM_IDS.PROJECTS_PAGE,
  services: SYSTEM_IDS.SERVICES_PAGE,
  spaces: SYSTEM_IDS.SPACES_PAGE,
  team: SYSTEM_IDS.TEAM_PAGE,
};

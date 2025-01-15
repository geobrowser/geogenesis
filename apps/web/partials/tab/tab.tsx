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
  const pageType = getPageTypeFromSlug(slug);

  if (!spaceId || !pageType) return null;

  const entityId = await fetchTabEntityId({
    spaceId,
    pageTypeEntityId: pageType.id,
  });

  if (!entityId) {
    const newEntityId = ID.createEntityId();

    const newParams = {
      id: spaceId,
      entityId: newEntityId,
    };

    return (
      <EmptyTab entityId={newEntityId} spaceId={spaceId} pageType={pageType}>
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

const getPageTypeFromSlug = (slug: string): { name: string; id: string } | null => {
  return pageTypes?.[slug] ?? null;
};

const pageTypes: Record<string, { name: string; id: string }> = {
  about: { name: 'About', id: SYSTEM_IDS.ABOUT_PAGE },
  activities: { name: 'Activities', id: SYSTEM_IDS.ACTIVITIES_PAGE },
  culture: { name: 'Culture', id: SYSTEM_IDS.CULTURE_PAGE },
  education: { name: 'Education', id: SYSTEM_IDS.EDUCATION_PAGE },
  events: { name: 'Events', id: SYSTEM_IDS.EVENTS_PAGE },
  finances: { name: 'Finances', id: SYSTEM_IDS.FINANCES_PAGE },
  government: { name: 'Government', id: SYSTEM_IDS.GOVERNMENT_PAGE },
  jobs: { name: 'Jobs', id: SYSTEM_IDS.JOBS_PAGE },
  news: { name: 'News', id: SYSTEM_IDS.NEWS_PAGE },
  ontology: { name: 'Ontology', id: SYSTEM_IDS.ONTOLOGY_PAGE },
  people: { name: 'People', id: SYSTEM_IDS.PEOPLE_PAGE },
  personal: { name: 'Personal', id: SYSTEM_IDS.PERSONAL_PAGE },
  places: { name: 'Places', id: SYSTEM_IDS.PLACES_PAGE },
  posts: { name: 'Posts', id: SYSTEM_IDS.POSTS_PAGE },
  products: { name: 'Products', id: SYSTEM_IDS.PRODUCTS_PAGE },
  professional: { name: 'Professional', id: SYSTEM_IDS.PROFESSIONAL_PAGE },
  projects: { name: 'Projects', id: SYSTEM_IDS.PROJECTS_PAGE },
  services: { name: 'Services', id: SYSTEM_IDS.SERVICES_PAGE },
  spaces: { name: 'spaces', id: SYSTEM_IDS.SPACES_PAGE },
  team: { name: 'Team', id: SYSTEM_IDS.TEAM_PAGE },
};

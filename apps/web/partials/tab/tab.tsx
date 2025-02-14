import { SYSTEM_IDS } from '@graphprotocol/grc-20';

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

  return (
    <>
      <div>{entityId}</div>
      <DefaultEntityPage params={params} showCover={false} showHeading={false} showHeader={false} notice={notice} />
    </>
  );
};

const getPageTypeFromSlug = (slug: string): { name: string; id: string } | null => {
  return pageTypes?.[slug] ?? null;
};

const pageTypes: Record<string, { name: string; id: string }> = {
  about: { name: 'About page', id: SYSTEM_IDS.ABOUT_PAGE },
  activities: { name: 'Activities page', id: SYSTEM_IDS.ACTIVITIES_PAGE },
  culture: { name: 'Culture page', id: SYSTEM_IDS.CULTURE_PAGE },
  education: { name: 'Education page', id: SYSTEM_IDS.EDUCATION_PAGE },
  events: { name: 'Events page', id: SYSTEM_IDS.EVENTS_PAGE },
  finances: { name: 'Finances page', id: SYSTEM_IDS.FINANCES_PAGE },
  government: { name: 'Government page', id: SYSTEM_IDS.GOVERNMENT_PAGE },
  jobs: { name: 'Jobs page', id: SYSTEM_IDS.JOBS_PAGE },
  news: { name: 'News page', id: SYSTEM_IDS.NEWS_PAGE },
  ontology: { name: 'Ontology page', id: SYSTEM_IDS.ONTOLOGY_PAGE },
  people: { name: 'People page', id: SYSTEM_IDS.PEOPLE_PAGE },
  personal: { name: 'Personal page', id: SYSTEM_IDS.PERSONAL_PAGE },
  places: { name: 'Places page', id: SYSTEM_IDS.PLACES_PAGE },
  posts: { name: 'Posts page', id: SYSTEM_IDS.POSTS_PAGE },
  products: { name: 'Products page', id: SYSTEM_IDS.PRODUCTS_PAGE },
  professional: { name: 'Professional page', id: SYSTEM_IDS.PROFESSIONAL_PAGE },
  projects: { name: 'Projects page', id: SYSTEM_IDS.PROJECTS_PAGE },
  services: { name: 'Services page', id: SYSTEM_IDS.SERVICES_PAGE },
  spaces: { name: 'spaces page', id: SYSTEM_IDS.SPACES_PAGE },
  team: { name: 'Team page', id: SYSTEM_IDS.TEAM_PAGE },
};

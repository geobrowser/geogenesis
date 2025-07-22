import { SystemIds } from '@graphprotocol/grc-20';

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
  about: { name: 'About page', id: SystemIds.ABOUT_PAGE },
  activities: { name: 'Activities page', id: SystemIds.ACTIVITIES_PAGE },
  culture: { name: 'Culture page', id: SystemIds.CULTURE_PAGE },
  education: { name: 'Education page', id: SystemIds.EDUCATION_PAGE },
  events: { name: 'Events page', id: SystemIds.EVENTS_PAGE },
  finances: { name: 'Finances page', id: SystemIds.FINANCES_PAGE },
  government: { name: 'Government page', id: SystemIds.GOVERNMENT_PAGE },
  jobs: { name: 'Jobs page', id: SystemIds.JOBS_PAGE },
  news: { name: 'News page', id: SystemIds.NEWS_PAGE },
  ontology: { name: 'Ontology page', id: SystemIds.ONTOLOGY_PAGE },
  people: { name: 'People page', id: SystemIds.PEOPLE_PAGE },
  personal: { name: 'Personal page', id: SystemIds.PERSONAL_PAGE },
  places: { name: 'Places page', id: SystemIds.PLACES_PAGE },
  posts: { name: 'Posts page', id: SystemIds.POSTS_PAGE },
  products: { name: 'Products page', id: SystemIds.PRODUCTS_PAGE },
  professional: { name: 'Professional page', id: SystemIds.PROFESSIONAL_PAGE },
  projects: { name: 'Projects page', id: SystemIds.PROJECTS_PAGE },
  services: { name: 'Services page', id: SystemIds.SERVICES_PAGE },
  spaces: { name: 'spaces page', id: SystemIds.SPACES_PAGE },
  team: { name: 'Team page', id: SystemIds.TEAM_PAGE },
};

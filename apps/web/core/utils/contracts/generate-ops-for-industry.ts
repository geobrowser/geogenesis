import { SYSTEM_IDS } from '@geogenesis/sdk';

import { cloneEntity } from './clone-entity';

export const generateOpsForIndustry = async (spaceConfigEntityId: string, spaceName: string) => {
  const [
    industryOverviewPageOps,
    industryNewsPageOps,
    industryEventsPageOps,
    industryProjectsPageOps,
    industryPeoplePageOps,
    industryJobsPageOps,
    industryOntologyPageOps,
    industryAboutPageOps,
  ] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_OVERVIEW_PAGE_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_NEWS_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_EVENTS_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_PROJECTS_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_PEOPLE_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_JOBS_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_ONTOLOGY_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.INDUSTRY_ABOUT_PAGE_TEMPLATE,
      entityName: '',
    }),
  ]);

  return [
    ...industryOverviewPageOps,
    ...industryNewsPageOps,
    ...industryEventsPageOps,
    ...industryProjectsPageOps,
    ...industryPeoplePageOps,
    ...industryJobsPageOps,
    ...industryOntologyPageOps,
    ...industryAboutPageOps,
  ];
};

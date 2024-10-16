import { SYSTEM_IDS } from '@geogenesis/sdk';

import { cloneEntity } from './clone-entity';

export const generateOpsForCompany = async (spaceConfigEntityId: string, spaceName: string) => {
  const [
    spaceConfigurationOps,
    postsPageOps,
    // productsPageOps,
    // servicesPageOps,
    eventsPageOps,
    // teamPageOps,
    jobsPageOps,
  ] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
      entityName: 'Posts',
    }),
    // cloneEntity({
    //   oldEntityId: SYSTEM_IDS.COMPANY_PRODUCTS_PAGE_TEMPLATE,
    //   entityName: 'Products',
    // }),
    // cloneEntity({
    //   oldEntityId: SYSTEM_IDS.COMPANY_SERVICES_PAGE_TEMPLATE,
    //   entityName: 'Services',
    // }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_EVENTS_PAGE_TEMPLATE,
      entityName: 'Events',
    }),
    // cloneEntity({
    //   oldEntityId: SYSTEM_IDS.COMPANY_TEAM_PAGE_TEMPLATE,
    //   entityName: 'Team',
    // }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
      entityName: 'Jobs',
    }),
  ]);

  return [
    ...spaceConfigurationOps,
    ...postsPageOps,
    // ...productsPageOps,
    // ...servicesPageOps,
    ...eventsPageOps,
    // ...teamPageOps,
    ...jobsPageOps,
  ];
};

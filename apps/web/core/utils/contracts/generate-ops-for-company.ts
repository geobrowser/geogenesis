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
      oldEntityId: SYSTEM_IDS.COMPANY_OVERVIEW_PAGE_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
      entityName: '',
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
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_TEAM_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
      entityName: '',
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

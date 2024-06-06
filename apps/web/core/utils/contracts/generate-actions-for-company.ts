import { SYSTEM_IDS } from '@geogenesis/ids';

import { cloneEntity } from './clone-entity';

export const generateActionsForCompany = async (
  spaceConfigEntityId: string,
  spaceName: string,
  spaceAddress: string
) => {
  const actions = [];

  const [
    spaceConfigurationActions,
    postsPageActions,
    // productsPageActions,
    // servicesPageActions,
    eventsPageActions,
    jobsPageActions,
  ] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
      spaceId: spaceAddress,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
      entityName: 'Posts',
      spaceId: spaceAddress,
    }),
    // cloneEntity({
    //   oldEntityId: SYSTEM_IDS.COMPANY_PRODUCTS_PAGE_TEMPLATE,
    //   entityName: 'Products',
    //   spaceId: spaceAddress,
    // }),
    // cloneEntity({
    //   oldEntityId: SYSTEM_IDS.COMPANY_SERVICES_PAGE_TEMPLATE,
    //   entityName: 'Services',
    //   spaceId: spaceAddress,
    // }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_EVENTS_PAGE_TEMPLATE,
      entityName: 'Services',
      spaceId: spaceAddress,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
      entityName: 'Jobs',
      spaceId: spaceAddress,
    }),
  ]);

  actions.push(
    ...spaceConfigurationActions,
    ...postsPageActions,
    // ...productsPageActions,
    // ...servicesPageActions,
    ...eventsPageActions,
    ...jobsPageActions
  );

  return actions;
};

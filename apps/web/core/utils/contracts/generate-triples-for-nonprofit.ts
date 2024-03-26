import { SYSTEM_IDS } from '@geogenesis/ids';

import { ID } from '~/core/id';
import { CreateTripleAction, OmitStrict, Triple } from '~/core/types';

export function generateTriplesForNonprofit(
  spaceConfigEntityId: string,
  spaceName: string,
  spaceAddress: string
): Array<CreateTripleAction> {
  const actions: Array<CreateTripleAction> = [];

  // Add Page foreign type
  const pageForeignTypeTriple: OmitStrict<Triple, 'id'> = {
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(pageForeignTypeTriple),
    ...pageForeignTypeTriple,
  });

  // Add Tag foreign type
  const tagForeignTypeTriple: OmitStrict<Triple, 'id'> = {
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Tag',
      id: '3d31f766-b651-48af-a357-271343a773de',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(tagForeignTypeTriple),
    ...tagForeignTypeTriple,
  });

  // Add Post foreign type
  const postForeignTypeTriple: OmitStrict<Triple, 'id'> = {
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Post',
      id: '682fbeff-41e2-42cd-a7f9-c4909136a8c5',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(postForeignTypeTriple),
    ...postForeignTypeTriple,
  });

  // Add Project foreign type
  const projectForeignTypeTriple: OmitStrict<Triple, 'id'> = {
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Project',
      id: 'cb9d261d-456b-4eaf-87e5-1e9faa441867',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(projectForeignTypeTriple),
    ...projectForeignTypeTriple,
  });

  // Add Finance Summary foreign type
  const financeSummaryForeignTypeTriple: OmitStrict<Triple, 'id'> = {
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Finance Summary',
      id: 'ce59ccc1-2ac5-4ace-8f82-09322434733d',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(financeSummaryForeignTypeTriple),
    ...financeSummaryForeignTypeTriple,
  });

  // Add space page table block entity
  const spacePageTableBlockEntityId = ID.createEntityId();

  const rowTypeSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
    attributeName: 'Row Type',
    entityId: spacePageTableBlockEntityId,
    entityName: 'Pages',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  const filterSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
    attributeName: 'Filter',
    entityId: spacePageTableBlockEntityId,
    entityName: 'Pages',
    space: spaceAddress,
    value: {
      type: 'string',
      value: `{typeIds_contains_nocase: ["1a9fc4a0-0fec-4eea-a075-eec7ebd0d043"], entityOf_: {space: "${spaceAddress}"}}`,
      id: ID.createValueId(),
    },
  };

  const parentEntitySpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageTableBlockEntityId,
    entityName: 'Pages',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: spaceName,
      id: spaceConfigEntityId,
    },
  };

  const nameSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: spacePageTableBlockEntityId,
    entityName: 'Pages',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Pages',
      id: ID.createValueId(),
    },
  };

  const typesSpacePageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: spacePageTableBlockEntityId,
    entityName: 'Pages',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Table Block',
      id: '88d59252-17ae-4d9a-a367-24710129eb47',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(rowTypeSpacePageTableBlockTriple),
    ...rowTypeSpacePageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(filterSpacePageTableBlockTriple),
    ...filterSpacePageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntitySpacePageTableBlockTriple),
    ...parentEntitySpacePageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameSpacePageTableBlockTriple),
    ...nameSpacePageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesSpacePageTableBlockTriple),
    ...typesSpacePageTableBlockTriple,
  });

  // Add space page blocks
  const spacePageBlocksTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
    attributeName: 'Blocks',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'string',
      value: `["${spacePageTableBlockEntityId}"]`,
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(spacePageBlocksTriple),
    ...spacePageBlocksTriple,
  });

  // Add posts page
  const postsPageEntityId = ID.createEntityId();

  const namePostsPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: postsPageEntityId,
    entityName: 'Posts',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Posts',
      id: ID.createValueId(),
    },
  };

  const typesPostsPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: postsPageEntityId,
    entityName: 'Posts',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(namePostsPageTriple),
    ...namePostsPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesPostsPageTriple),
    ...typesPostsPageTriple,
  });

  // Add posts page table block
  const postsPageTableBlockEntityId = ID.createEntityId();

  const rowTypePostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
    attributeName: 'Row Type',
    entityId: postsPageTableBlockEntityId,
    entityName: 'Posts',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Post',
      id: '682fbeff-41e2-42cd-a7f9-c4909136a8c5',
    },
  };

  const filterPostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
    attributeName: 'Filter',
    entityId: postsPageTableBlockEntityId,
    entityName: 'Posts',
    space: spaceAddress,
    value: {
      type: 'string',
      value: `{typeIds_contains_nocase: ["682fbeff-41e2-42cd-a7f9-c4909136a8c5"], entityOf_: {space: "${spaceAddress}"}}`,
      id: ID.createValueId(),
    },
  };

  const parentEntityPostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageTableBlockEntityId,
    entityName: 'Posts',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: spaceName,
      id: postsPageEntityId,
    },
  };

  const namePostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: postsPageTableBlockEntityId,
    entityName: 'Posts',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Posts',
      id: ID.createValueId(),
    },
  };

  const typesPostsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: spacePageTableBlockEntityId,
    entityName: 'Posts',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Table Block',
      id: '88d59252-17ae-4d9a-a367-24710129eb47',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(rowTypePostsPageTableBlockTriple),
    ...rowTypePostsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(filterPostsPageTableBlockTriple),
    ...filterPostsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntityPostsPageTableBlockTriple),
    ...parentEntityPostsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(namePostsPageTableBlockTriple),
    ...namePostsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesPostsPageTableBlockTriple),
    ...typesPostsPageTableBlockTriple,
  });

  // Add posts page blocks
  const postsPageBlocksTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
    attributeName: 'Blocks',
    entityId: postsPageEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'string',
      value: `["${postsPageTableBlockEntityId}"]`,
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(postsPageBlocksTriple),
    ...postsPageBlocksTriple,
  });

  // Add finances page
  const financesPageEntityId = ID.createEntityId();

  const nameFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: financesPageEntityId,
    entityName: 'Finances',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Finances',
      id: ID.createValueId(),
    },
  };

  const typesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: financesPageEntityId,
    entityName: 'Finances',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameFinancesPageTriple),
    ...nameFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesFinancesPageTriple),
    ...typesFinancesPageTriple,
  });

  // Add finances page table block
  const financesPageTableBlockEntityId = ID.createEntityId();

  const shownColumnsOtherRevenueSourcesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '0b623cb1-ba1d-407a-b9cc-58becb52b531',
      name: 'Other revenue sources',
    },
  };

  const shownColumnsNonFinancialAssetsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '15645106-d203-4db1-8692-012a6e06349f',
      name: 'Non-financial assets',
    },
  };

  const shownColumnsConstructionCostsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '5572bb78-1e9b-4752-8333-72e7c2c90c8b',
      name: 'Construction costs',
    },
  };

  const shownColumnsOtherExpensesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '6c90a975-5da7-4f5a-9401-514d30dd9926',
      name: 'Other expenses',
    },
  };

  const shownColumnsGrantsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '73984ff3-11e6-4b42-bd09-07f34d4be0e2',
      name: 'Grants',
    },
  };

  const shownColumnsProgramServicesFeesFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '8a573366-1d86-48b6-b861-c48aad11486f',
      name: 'Program services fees',
    },
  };

  const shownColumnsContributionsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: '9e94fc0c-2f6e-4fd6-894b-eef6bfe64d49',
      name: 'Contributions',
    },
  };

  const shownColumnsSalariesAndBenefitsFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: 'bc6d8191-1626-42b2-a8fc-6d639535306c',
      name: 'Salaries + Benefits',
    },
  };

  const shownColumnsTotalRevenueFinancesPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '388ad59b-1cc7-413c-a0bb-34a4de48c758',
    attributeName: 'Shown Columns',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      id: 'e769b6ac-2387-4b37-919b-9cab193868fd',
      name: 'Total revenue',
    },
  };

  const rowTypeFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
    attributeName: 'Row Type',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Finance Summary',
      id: 'ce59ccc1-2ac5-4ace-8f82-09322434733d',
    },
  };

  const filterFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
    attributeName: 'Filter',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'string',
      value: `{typeIds_contains_nocase: ["682fbeff-41e2-42cd-a7f9-c4909136a8c5"], entityOf_: {space: "${spaceAddress}"}}`,
      id: ID.createValueId(),
    },
  };

  const parentEntityFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageTableBlockEntityId,
    entityName: 'Finance Summaries',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Finances',
      id: financesPageEntityId,
    },
  };

  const nameFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Finance Summary',
      id: ID.createValueId(),
    },
  };

  const typesFinancesPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Table Block',
      id: '88d59252-17ae-4d9a-a367-24710129eb47',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsOtherRevenueSourcesFinancesPageTriple),
    ...shownColumnsOtherRevenueSourcesFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsNonFinancialAssetsFinancesPageTriple),
    ...shownColumnsNonFinancialAssetsFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsConstructionCostsFinancesPageTriple),
    ...shownColumnsConstructionCostsFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsOtherExpensesFinancesPageTriple),
    ...shownColumnsOtherExpensesFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsGrantsFinancesPageTriple),
    ...shownColumnsGrantsFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsProgramServicesFeesFinancesPageTriple),
    ...shownColumnsProgramServicesFeesFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsContributionsFinancesPageTriple),
    ...shownColumnsContributionsFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsSalariesAndBenefitsFinancesPageTriple),
    ...shownColumnsSalariesAndBenefitsFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(shownColumnsTotalRevenueFinancesPageTriple),
    ...shownColumnsTotalRevenueFinancesPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(rowTypeFinancesPageTableBlockTriple),
    ...rowTypeFinancesPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(filterFinancesPageTableBlockTriple),
    ...filterFinancesPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntityFinancesPageTableBlockTriple),
    ...parentEntityFinancesPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameFinancesPageTableBlockTriple),
    ...nameFinancesPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesFinancesPageTableBlockTriple),
    ...typesFinancesPageTableBlockTriple,
  });

  // Add finances page blocks
  const financesPageBlocksTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
    attributeName: 'Blocks',
    entityId: financesPageEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'string',
      value: `["${financesPageTableBlockEntityId}"]`,
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(financesPageBlocksTriple),
    ...financesPageBlocksTriple,
  });

  // Add projects page
  const projectsPageEntityId = ID.createEntityId();

  const nameProjectsPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: projectsPageEntityId,
    entityName: 'Projects',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Projects',
      id: ID.createValueId(),
    },
  };

  const typesProjectsPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: projectsPageEntityId,
    entityName: 'Projects',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameProjectsPageTriple),
    ...nameProjectsPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesProjectsPageTriple),
    ...typesProjectsPageTriple,
  });

  // Add projects page table block
  const projectsPageTableBlockEntityId = ID.createEntityId();

  const rowTypeProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '577bd9fb-b29e-4e2b-b5f8-f48aedbd26ac',
    attributeName: 'Row Type',
    entityId: projectsPageTableBlockEntityId,
    entityName: 'Projects',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Project',
      id: '682fbeff-41e2-42cd-a7f9-c4909136a8c5',
    },
  };

  const filterProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'b0f2d71a-79ca-4dc4-9218-e3e40dfed103',
    attributeName: 'Filter',
    entityId: projectsPageTableBlockEntityId,
    entityName: 'Projects',
    space: spaceAddress,
    value: {
      type: 'string',
      value: `{typeIds_contains_nocase: ["682fbeff-41e2-42cd-a7f9-c4909136a8c5"], entityOf_: {space: "${spaceAddress}"}}`,
      id: ID.createValueId(),
    },
  };

  const parentEntityProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: projectsPageTableBlockEntityId,
    entityName: 'Projects',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Projects',
      id: projectsPageEntityId,
    },
  };

  const nameProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: projectsPageTableBlockEntityId,
    entityName: 'Projects',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Projects',
      id: ID.createValueId(),
    },
  };

  const typesProjectsPageTableBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: spacePageTableBlockEntityId,
    entityName: 'Projects',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Table Block',
      id: '88d59252-17ae-4d9a-a367-24710129eb47',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(rowTypeProjectsPageTableBlockTriple),
    ...rowTypeProjectsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(filterProjectsPageTableBlockTriple),
    ...filterProjectsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntityProjectsPageTableBlockTriple),
    ...parentEntityProjectsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameProjectsPageTableBlockTriple),
    ...nameProjectsPageTableBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesProjectsPageTableBlockTriple),
    ...typesProjectsPageTableBlockTriple,
  });

  // Add projects page blocks
  const projectsPageBlocksTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
    attributeName: 'Blocks',
    entityId: projectsPageEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'string',
      value: `["${projectsPageTableBlockEntityId}"]`,
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(projectsPageBlocksTriple),
    ...projectsPageBlocksTriple,
  });

  // Add about us page
  const aboutUsPageEntityId = ID.createEntityId();

  const nameAboutUsPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: aboutUsPageEntityId,
    entityName: 'About Us',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'About Us',
      id: ID.createValueId(),
    },
  };

  const typesAboutUsPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: aboutUsPageEntityId,
    entityName: 'About Us',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameAboutUsPageTriple),
    ...nameAboutUsPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesAboutUsPageTriple),
    ...typesAboutUsPageTriple,
  });

  // Add get involved page
  const getInvolvedPageEntityId = ID.createEntityId();

  const nameGetInvolvedPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: getInvolvedPageEntityId,
    entityName: 'Get Involved',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Get Involved',
      id: ID.createValueId(),
    },
  };

  const typesGetInvolvedPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: getInvolvedPageEntityId,
    entityName: 'Get Involved',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Page',
      id: '1a9fc4a0-0fec-4eea-a075-eec7ebd0d043',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameGetInvolvedPageTriple),
    ...nameGetInvolvedPageTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesGetInvolvedPageTriple),
    ...typesGetInvolvedPageTriple,
  });

  return actions;
}

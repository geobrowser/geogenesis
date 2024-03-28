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

  // Add Finance Overview foreign type
  const financeOverviewForeignTypeTriple: OmitStrict<Triple, 'id'> = {
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    entityId: spaceConfigEntityId,
    entityName: spaceName,
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Finance Overview',
      id: '2cc9d244-59ea-427f-9257-f1362a5fa952',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(financeOverviewForeignTypeTriple),
    ...financeOverviewForeignTypeTriple,
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

  // Add space page headline block
  const spacePageHeadlineBlockEntityId = ID.createEntityId();

  const parentEntitySpacePageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageHeadlineBlockEntityId,
    entityName: 'Welcome to our nonpr',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: spaceName,
      id: spaceConfigEntityId,
    },
  };

  const markdownContentSpacePageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageHeadlineBlockEntityId,
    entityName: 'Welcome to our nonpr',
    attributeId: 'f88047ce-bd8d-4fbf-83f6-58e84ee533e4',
    attributeName: 'Markdown Content',
    space: spaceAddress,
    value: {
      type: 'string',
      id: ID.createValueId(),
      value: '## Welcome to our nonprofit!\n\n',
    },
  };

  const nameSpacePageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: spacePageHeadlineBlockEntityId,
    entityName: 'Welcome to our nonpr',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Welcome to our nonpr',
      id: ID.createValueId(),
    },
  };

  const typesSpacePageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: spacePageHeadlineBlockEntityId,
    entityName: 'Welcome to our nonpr',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Text Block',
      id: '8426caa1-43d6-47d4-a6f1-00c7c1a9a320',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntitySpacePageHeadlineBlockTriple),
    ...parentEntitySpacePageHeadlineBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(markdownContentSpacePageHeadlineBlockTriple),
    ...markdownContentSpacePageHeadlineBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameSpacePageHeadlineBlockTriple),
    ...nameSpacePageHeadlineBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesSpacePageHeadlineBlockTriple),
    ...typesSpacePageHeadlineBlockTriple,
  });

  // Add space page body block
  const spacePageBodyBlockEntityId = ID.createEntityId();

  const parentEntitySpacePageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageBodyBlockEntityId,
    entityName: "We're thrilled to ha",
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: spaceName,
      id: spaceConfigEntityId,
    },
  };

  const markdownContentSpacePageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: spacePageBodyBlockEntityId,
    entityName: "We're thrilled to ha",
    attributeId: 'f88047ce-bd8d-4fbf-83f6-58e84ee533e4',
    attributeName: 'Markdown Content',
    space: spaceAddress,
    value: {
      type: 'string',
      id: ID.createValueId(),
      value:
        "We're thrilled to have you here. At our core, we are driven by a passionate commitment to positive change. As a community, we believe in the power of collective action to make a difference, no matter how big or small. Together, we can create meaningful impact and contribute to a better world. Thank you for joining us on this journey towards a brighter future.\n\n",
    },
  };

  const nameSpacePageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: spacePageBodyBlockEntityId,
    entityName: "We're thrilled to ha",
    space: spaceAddress,
    value: {
      type: 'string',
      value: "We're thrilled to ha",
      id: ID.createValueId(),
    },
  };

  const typesSpacePageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: spacePageBodyBlockEntityId,
    entityName: "We're thrilled to ha",
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Table Block',
      id: '88d59252-17ae-4d9a-a367-24710129eb47',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntitySpacePageBodyBlockTriple),
    ...parentEntitySpacePageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(markdownContentSpacePageBodyBlockTriple),
    ...markdownContentSpacePageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameSpacePageBodyBlockTriple),
    ...nameSpacePageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesSpacePageBodyBlockTriple),
    ...typesSpacePageBodyBlockTriple,
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
      value: `["${spacePageHeadlineBlockEntityId}","${spacePageBodyBlockEntityId}"]`,
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(spacePageBlocksTriple),
    ...spacePageBlocksTriple,
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
      name: 'Finance Overview',
      id: '2cc9d244-59ea-427f-9257-f1362a5fa952',
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

  // Add finances page body block
  const financesPageBodyBlockEntityId = ID.createEntityId();

  const parentEntityFinancesPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: financesPageBodyBlockEntityId,
    entityName: 'Welcome to the finan',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: spaceName,
      id: spaceConfigEntityId,
    },
  };

  const markdownContentFinancesPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: financesPageBodyBlockEntityId,
    entityName: 'Welcome to the finan',
    attributeId: 'f88047ce-bd8d-4fbf-83f6-58e84ee533e4',
    attributeName: 'Markdown Content',
    space: spaceAddress,
    value: {
      type: 'string',
      id: ID.createValueId(),
      value: 'Welcome to the finance summary of this nonprofit.\n\n',
    },
  };

  const nameFinancesPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: financesPageBodyBlockEntityId,
    entityName: 'Welcome to the finan',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Welcome to the finan',
      id: ID.createValueId(),
    },
  };

  const typesFinancesPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: financesPageBodyBlockEntityId,
    entityName: 'Welcome to the finan',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Table Block',
      id: '88d59252-17ae-4d9a-a367-24710129eb47',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntityFinancesPageBodyBlockTriple),
    ...parentEntityFinancesPageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(markdownContentFinancesPageBodyBlockTriple),
    ...markdownContentFinancesPageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameFinancesPageBodyBlockTriple),
    ...nameFinancesPageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesFinancesPageBodyBlockTriple),
    ...typesFinancesPageBodyBlockTriple,
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
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    entityId: financesPageTableBlockEntityId,
    entityName: 'Finance Summaries',
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
      value: `["${financesPageBodyBlockEntityId}","${financesPageTableBlockEntityId}"]`,
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(financesPageBlocksTriple),
    ...financesPageBlocksTriple,
  });

  // Add sample summary page
  const sampleSummaryPageEntityId = ID.createEntityId();

  const constructionCostsSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '5572bb78-1e9b-4752-8333-72e7c2c90c8b',
    attributeName: 'Construction costs',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(constructionCostsSampleSummaryPageTriple),
    ...constructionCostsSampleSummaryPageTriple,
  });

  const contributionsSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '9e94fc0c-2f6e-4fd6-894b-eef6bfe64d49',
    attributeName: 'Contributions',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(contributionsSampleSummaryPageTriple),
    ...contributionsSampleSummaryPageTriple,
  });

  const grantsSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '73984ff3-11e6-4b42-bd09-07f34d4be0e2',
    attributeName: 'Grants',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(grantsSampleSummaryPageTriple),
    ...grantsSampleSummaryPageTriple,
  });

  const nonFinancialAssetsSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '15645106-d203-4db1-8692-012a6e06349f',
    attributeName: 'Non-financial assets',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nonFinancialAssetsSampleSummaryPageTriple),
    ...nonFinancialAssetsSampleSummaryPageTriple,
  });

  const otherExpensesSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '6c90a975-5da7-4f5a-9401-514d30dd9926',
    attributeName: 'Other expenses',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(otherExpensesSampleSummaryPageTriple),
    ...otherExpensesSampleSummaryPageTriple,
  });

  const otherRevenueSourcesSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '0b623cb1-ba1d-407a-b9cc-58becb52b531',
    attributeName: 'Other revenue sources',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(otherRevenueSourcesSampleSummaryPageTriple),
    ...otherRevenueSourcesSampleSummaryPageTriple,
  });

  const programServicesFeesSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: '8a573366-1d86-48b6-b861-c48aad11486f',
    attributeName: 'Program services fees',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(programServicesFeesSampleSummaryPageTriple),
    ...programServicesFeesSampleSummaryPageTriple,
  });

  const salariesAndBenefitsSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'bc6d8191-1626-42b2-a8fc-6d639535306c',
    attributeName: 'Salaries + Benefits',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(salariesAndBenefitsSampleSummaryPageTriple),
    ...salariesAndBenefitsSampleSummaryPageTriple,
  });

  const totalRevenueSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'e769b6ac-2387-4b37-919b-9cab193868fd',
    attributeName: 'Total revenue',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: '$0.00',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(totalRevenueSampleSummaryPageTriple),
    ...totalRevenueSampleSummaryPageTriple,
  });

  const nameSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      id: 'b9f9193a-f831-4b91-b7a6-52d5ac2a2548',
      value: 'Sample summary',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameSampleSummaryPageTriple),
    ...nameSampleSummaryPageTriple,
  });

  const descriptionSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'Description',
    attributeName: 'Description',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'This page is an example of a finance summary',
      id: ID.createValueId(),
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(descriptionSampleSummaryPageTriple),
    ...descriptionSampleSummaryPageTriple,
  });

  const typesSampleSummaryPageTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Finance Summary',
      id: 'ce59ccc1-2ac5-4ace-8f82-09322434733d',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesSampleSummaryPageTriple),
    ...typesSampleSummaryPageTriple,
  });

  // Add sample summary blocks
  const sampleSummaryPageHeadlineBlockEntityId = ID.createEntityId();

  const parentEntitySampleSummaryPageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: sampleSummaryPageHeadlineBlockEntityId,
    entityName: 'Welcome to this exam',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Sample summary',
      id: sampleSummaryPageEntityId,
    },
  };

  const markdownContentSampleSummaryPageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: sampleSummaryPageHeadlineBlockEntityId,
    entityName: 'Welcome to this exam',
    attributeId: 'f88047ce-bd8d-4fbf-83f6-58e84ee533e4',
    attributeName: 'Markdown Content',
    space: spaceAddress,
    value: {
      type: 'string',
      id: ID.createValueId(),
      value: '**Welcome to this example finance summary.**\n\n',
    },
  };

  const nameSampleSummaryPageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: sampleSummaryPageHeadlineBlockEntityId,
    entityName: 'Welcome to this exam',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Welcome to this exam',
      id: ID.createValueId(),
    },
  };

  const typesSampleSummaryPageHeadlineBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: sampleSummaryPageHeadlineBlockEntityId,
    entityName: 'Welcome to this exam',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Text Block',
      id: '8426caa1-43d6-47d4-a6f1-00c7c1a9a320',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntitySampleSummaryPageHeadlineBlockTriple),
    ...parentEntitySampleSummaryPageHeadlineBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(markdownContentSampleSummaryPageHeadlineBlockTriple),
    ...markdownContentSampleSummaryPageHeadlineBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameSampleSummaryPageHeadlineBlockTriple),
    ...nameSampleSummaryPageHeadlineBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesSampleSummaryPageHeadlineBlockTriple),
    ...typesSampleSummaryPageHeadlineBlockTriple,
  });

  const sampleSummaryPageBodyBlockEntityId = ID.createEntityId();

  const parentEntitySampleSummaryPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: sampleSummaryPageBodyBlockEntityId,
    entityName: 'Add your financial d',
    attributeId: 'dd4999b9-77f0-4c2b-a02b-5a26b233854e',
    attributeName: 'Parent Entity',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Sample summary',
      id: sampleSummaryPageEntityId,
    },
  };

  const markdownContentSampleSummaryPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    entityId: sampleSummaryPageBodyBlockEntityId,
    entityName: 'Add your financial d',
    attributeId: 'f88047ce-bd8d-4fbf-83f6-58e84ee533e4',
    attributeName: 'Markdown Content',
    space: spaceAddress,
    value: {
      type: 'string',
      id: ID.createValueId(),
      value: 'Add your financial details below, and any other information on this entity for this financial year.\n\n',
    },
  };

  const nameSampleSummaryPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'name',
    attributeName: 'Name',
    entityId: sampleSummaryPageBodyBlockEntityId,
    entityName: 'Add your financial d',
    space: spaceAddress,
    value: {
      type: 'string',
      value: 'Add your financial d',
      id: ID.createValueId(),
    },
  };

  const typesSampleSummaryPageBodyBlockTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'type',
    attributeName: 'Types',
    entityId: sampleSummaryPageBodyBlockEntityId,
    entityName: 'Add your financial d',
    space: spaceAddress,
    value: {
      type: 'entity',
      name: 'Text Block',
      id: '8426caa1-43d6-47d4-a6f1-00c7c1a9a320',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(parentEntitySampleSummaryPageBodyBlockTriple),
    ...parentEntitySampleSummaryPageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(markdownContentSampleSummaryPageBodyBlockTriple),
    ...markdownContentSampleSummaryPageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(nameSampleSummaryPageBodyBlockTriple),
    ...nameSampleSummaryPageBodyBlockTriple,
  });

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(typesSampleSummaryPageBodyBlockTriple),
    ...typesSampleSummaryPageBodyBlockTriple,
  });

  const sampleSummaryPageBlocksTriple: OmitStrict<Triple, 'id'> = {
    attributeId: 'beaba5cb-a677-41a8-b353-77030613fc70',
    attributeName: 'Blocks',
    entityId: sampleSummaryPageEntityId,
    entityName: 'Sample summary',
    space: spaceAddress,
    value: {
      type: 'string',
      value: `["${sampleSummaryPageHeadlineBlockEntityId}","${sampleSummaryPageBodyBlockEntityId}"]`,
      id: '341d2e1b-eb8f-4b14-8b04-071ba273ba18',
    },
  };

  actions.push({
    type: 'createTriple',
    id: ID.createTripleId(sampleSummaryPageBlocksTriple),
    ...sampleSummaryPageBlocksTriple,
  });

  return actions;
}

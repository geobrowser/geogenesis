import { DataBlock, type Op, Position, Relation, SYSTEM_IDS, TextBlock } from '@geogenesis/sdk';

type Template = {
  id: string;
  name: string;
  blocks: Op[];
  types: string[]; // system ids
  foreignTypes: string[]; // system ids
  extraData: Op[];
};

function getBlockPositions() {
  const first = Position.createBetween();
  const second = Position.createBetween(first);
  const third = Position.createBetween(second);
  const fourth = Position.createBetween(second);
  const fifth = Position.createBetween(second);

  return { first, second, third, fourth, fifth };
}

const POSITIONS = getBlockPositions();

const NONPROFIT: Template[] = [
  {
    id: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
    name: 'Nonprofit Space Configuration Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
        text: '## Welcome to our nonprofit!',
        position: POSITIONS.first,
      }),
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
        text: `We're thrilled to have you here. At our core, we are driven by a passionate commitment to positive change. As a community, we believe in the power of collective action to make a difference, no matter how big or small. Together, we can create meaningful impact and contribute to a better world. Thank you for joining us on this journey towards a brighter future.`,
        position: POSITIONS.second,
      }),
    ],
    types: [SYSTEM_IDS.NONPROFIT_TYPE, SYSTEM_IDS.PROJECT_TYPE],
    extraData: [],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.NONPROFIT_POSTS_PAGE_TEMPLATE,
    name: 'Nonprofit Posts Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_POSTS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Posts',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_POSTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.POSTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.NONPROFIT_PROJECTS_PAGE_TEMPLATE,
    name: 'Nonprofit Projects Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_PROJECTS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Projects',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_PROJECTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.PROJECTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.NONPROFIT_TEAM_PAGE_TEMPLATE,
    name: 'Nonprofit Team Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_TEAM_PAGE_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Projects',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_TEAM_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.PROJECTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
    name: 'Nonprofit Finances Page Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
        text: 'Welcome to the finance summary of this nonprofit.',
        position: POSITIONS.first,
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Finance Summaries',
        position: POSITIONS.second,
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.FINANCES_PAGE,
      }),
    ],
    foreignTypes: [],
  },
];

const COMPANY: Template[] = [
  {
    id: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
    name: 'Company Space Configuration Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
        text: '## Welcome to our company!',
        position: POSITIONS.first,
      }),
      ...TextBlock.make({
        fromId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
        text: `We're dedicated to pushing boundaries and fostering innovation. With a focus on excellence and a passion for progress, we strive to make a positive impact in everything we do. From our talented team to our cutting-edge solutions, we're committed to delivering unparalleled quality and service to our customers.`,
        position: POSITIONS.second,
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Goals',
        position: POSITIONS.third,
      }),
    ],
    types: [SYSTEM_IDS.COMPANY_TYPE],
    extraData: [],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
    name: 'Company Posts Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Posts',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      Relation.make({
        fromId: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.POSTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.COMPANY_EVENTS_PAGE_TEMPLATE,
    name: 'Company Events Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_EVENTS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Events',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Events page
      Relation.make({
        fromId: SYSTEM_IDS.COMPANY_EVENTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.EVENTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
    name: 'Company Jobs Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Job openings',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Jobs page
      Relation.make({
        fromId: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.JOBS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.COMPANY_PRODUCTS_PAGE_TEMPLATE,
    name: 'Company Products Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_PRODUCTS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Products',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Products page
      Relation.make({
        fromId: SYSTEM_IDS.COMPANY_PRODUCTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.PRODUCTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.COMPANY_SERVICES_PAGE_TEMPLATE,
    name: 'Company Services Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_SERVICES_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Services',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Services page
      Relation.make({
        fromId: SYSTEM_IDS.COMPANY_SERVICES_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.SERVICES_PAGE,
      }),
    ],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.COMPANY_TEAM_PAGE_TEMPLATE,
    name: 'Company Team Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_TEAM_PAGE_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Team members',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Team page
      Relation.make({
        fromId: SYSTEM_IDS.COMPANY_TEAM_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.TEAM_PAGE,
      }),
    ],
    foreignTypes: [],
  },
];

const PERSON: Template[] = [
  {
    id: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
    name: 'Person Space Configuration Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        text: '## Welcome to my personal space',
        position: POSITIONS.first,
      }),
      ...TextBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        text: `This space is where I compile my interests, posts, collections, and a summary of myself, along with anything else I'd like to share with the broader Geo community.`,
        position: POSITIONS.second,
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Goals',
        position: POSITIONS.third,
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Skills',
        position: POSITIONS.fourth,
      }),
    ],
    types: [SYSTEM_IDS.PERSON_TYPE],
    extraData: [],
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.PERSON_POSTS_PAGE_TEMPLATE,
    name: 'Person Posts Page Template',
    blocks: [
      ...DataBlock.make({
        fromId: SYSTEM_IDS.PERSON_POSTS_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Posts',
      }),
    ],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      Relation.make({
        fromId: SYSTEM_IDS.PERSON_POSTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.POSTS_PAGE,
      }),
    ],
    foreignTypes: [],
  },
];

export const ops: Op[] = [...NONPROFIT, ...COMPANY, ...PERSON].flatMap(t => {
  const nameOp: Op = {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.NAME_ATTRIBUTE,
      entity: t.id,
      value: {
        type: 'TEXT',
        value: t.name,
      },
    },
  };

  const typesOps = t.types.map(typeId =>
    Relation.make({
      fromId: t.id,
      relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
      toId: typeId,
    })
  );

  return [nameOp, ...typesOps.flat(), ...t.blocks, ...t.extraData];
});

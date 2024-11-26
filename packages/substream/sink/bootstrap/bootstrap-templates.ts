import { DataBlock, Relation, SYSTEM_IDS, TextBlock } from '@geogenesis/sdk';

import type { Op } from '../types';
import { SPACE_ID } from './constants';

type Template = {
  id: string;
  name: string;
  blocks: Op[];
  types: string[]; // system ids
  foreignTypes: string[]; // system ids
  extraData: Op[];
};

const NONPROFIT: Template[] = [
  {
    id: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
    name: 'Nonprofit Space Configuration Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
        text: '## Welcome to our nonprofit!',
        position: 'a0',
      }),
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
        text: `We're thrilled to have you here. At our core, we are driven by a passionate commitment to positive change. As a community, we believe in the power of collective action to make a difference, no matter how big or small. Together, we can create meaningful impact and contribute to a better world. Thank you for joining us on this journey towards a brighter future.`,
        position: 'a1',
      }),
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.NONPROFIT_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.SPACE_CONFIGURATION],
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      ...Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_POSTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.POSTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      ...Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_PROJECTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.PROJECTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      ...Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_TEAM_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.PROJECTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
    foreignTypes: [],
  },
  {
    id: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
    name: 'Nonprofit Finances Page Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
        text: 'Welcome to the finance summary of this nonprofit.',
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
        sourceType: 'GEO',
        name: 'Finance Summaries',
        position: 'a1',
      }),
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      ...Relation.make({
        fromId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.FINANCES_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
        position: 'a0',
      }),
      ...TextBlock.make({
        fromId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
        text: `We're dedicated to pushing boundaries and fostering innovation. With a focus on excellence and a passion for progress, we strive to make a positive impact in everything we do. From our talented team to our cutting-edge solutions, we're committed to delivering unparalleled quality and service to our customers.`,
        position: 'a1',
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.COMPANY_SPACE_CONFIGURATION_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Goals',
        position: 'a3',
      }),
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.SPACE_CONFIGURATION, SYSTEM_IDS.COMPANY_TYPE],
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      ...Relation.make({
        fromId: SYSTEM_IDS.COMPANY_POSTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.POSTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Events page
      ...Relation.make({
        fromId: SYSTEM_IDS.COMPANY_EVENTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.EVENTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Jobs page
      ...Relation.make({
        fromId: SYSTEM_IDS.COMPANY_JOBS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.JOBS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Products page
      ...Relation.make({
        fromId: SYSTEM_IDS.COMPANY_PRODUCTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.PRODUCTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Services page
      ...Relation.make({
        fromId: SYSTEM_IDS.COMPANY_SERVICES_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.SERVICES_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Team page
      ...Relation.make({
        fromId: SYSTEM_IDS.COMPANY_TEAM_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.TEAM_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
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
        position: 'a0',
      }),
      ...TextBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        text: `This space is where I compile my interests, posts, collections, and a summary of myself, along with anything else I'd like to share with the broader Geo community.`,
        position: 'a1',
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Goals',
        position: 'a2',
      }),
      ...DataBlock.make({
        fromId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
        sourceType: 'COLLECTION',
        name: 'Skills',
        position: 'a3',
      }),
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.SPACE_CONFIGURATION, SYSTEM_IDS.PERSON_TYPE],
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
    ].map(o => ({ ...o, space: SPACE_ID })) as Op[],
    types: [SYSTEM_IDS.PAGE_TYPE],
    extraData: [
      // Page type -> Posts page
      ...Relation.make({
        fromId: SYSTEM_IDS.PERSON_POSTS_PAGE_TEMPLATE,
        relationTypeId: SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE,
        toId: SYSTEM_IDS.POSTS_PAGE,
      }),
    ].map(o => ({ ...o, space: SPACE_ID })),
    foreignTypes: [],
  },
];

export const templateOps: Op[] = [...NONPROFIT, ...COMPANY, ...PERSON]
  .flatMap(t => {
    const nameOp: Op = {
      type: 'SET_TRIPLE',
      space: SPACE_ID,
      triple: {
        attribute: SYSTEM_IDS.NAME,
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
        relationTypeId: SYSTEM_IDS.TYPES,
        toId: typeId,
      })
    );

    return [nameOp, ...typesOps.flat(), ...t.blocks, ...t.extraData];
  })
  .map(o => ({ ...o, space: SPACE_ID }));

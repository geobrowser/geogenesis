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

// type Attribute = {
//   name: string;
//   blocks: Op[];
//   valueType: string;
// };

const TEMPLATES: Template[] = [
  {
    id: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
    name: 'Nonprofit Space Configuration Template',
    blocks: [
      ...TextBlock.make({
        fromId: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
        text: '# Welcome to our nonprofit!',
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

export const templateOps: Op[] = TEMPLATES.flatMap(t => {
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
}).map(o => ({ ...o, space: SPACE_ID }));

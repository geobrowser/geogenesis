import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { type FilterStateResult, parseFiltersSync } from '~/core/blocks/data/filters';
import { DATA_BLOCK_VIEW_EXPLORE_ID } from '~/core/data-block-ids';
import { RANKING_VIEW_PILL_ID } from '~/core/ranking-block-ids';

import { generateNewSpaceTemplateOps } from './generate-new-space-template';

const SPACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_HOME_ENTITY_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/**
 * The overview every new space is created with, in the order it renders.
 */
const OVERVIEW_BLOCKS = [
  { name: 'Recent debates', view: SystemIds.GALLERY_VIEW },
  { name: 'Trending claims', view: SystemIds.BULLETED_LIST_VIEW },
  { name: 'Trending topics', view: RANKING_VIEW_PILL_ID },
  { name: 'Recent news', view: DATA_BLOCK_VIEW_EXPLORE_ID },
];

type OpValue = { value?: { value?: unknown } };

type RelationOp = {
  entity: Uint8Array;
  from: Uint8Array;
  to: Uint8Array;
  relationType: Uint8Array;
  position?: string;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

const templateOps = () => generateNewSpaceTemplateOps({ spaceId: SPACE_ID, spaceHomeEntityId: SPACE_HOME_ENTITY_ID });

const relationOps = (ops: ReturnType<typeof templateOps>) =>
  ops.filter((op): op is (typeof ops)[number] & RelationOp => 'from' in op);

/** Entity id → name, so a failure names the block instead of a hex id. */
function namesById(ops: ReturnType<typeof templateOps>) {
  const names = new Map<string, string>();

  for (const op of ops) {
    if (!('values' in op) || !Array.isArray(op.values)) continue;

    for (const value of op.values as Array<{ property?: Uint8Array; value?: { value?: unknown } }>) {
      if (!value.property || toHex(value.property) !== SystemIds.NAME_PROPERTY) continue;
      if (typeof value.value?.value === 'string') names.set(toHex((op as { id: Uint8Array }).id), value.value.value);
    }
  }

  return names;
}

function overviewBlockRelations(ops: ReturnType<typeof templateOps>) {
  return relationOps(ops).filter(
    op => toHex(op.from) === SPACE_HOME_ENTITY_ID && toHex(op.relationType) === SystemIds.BLOCKS
  );
}

function blockFilters() {
  return generateNewSpaceTemplateOps({ spaceId: SPACE_ID, spaceHomeEntityId: SPACE_HOME_ENTITY_ID })
    .flatMap(op => ('values' in op && Array.isArray(op.values) ? (op.values as OpValue[]) : []))
    .map(value => value.value?.value)
    .filter((value): value is string => typeof value === 'string' && value.includes('"filter"'))
    .map(parseFiltersSync);
}

const typeFilters = (parsed: FilterStateResult) =>
  parsed.filters.filter(filter => filter.columnId === SystemIds.TYPES_PROPERTY);

describe('generateNewSpaceTemplateOps', () => {
  it('asks the Recent news block for any of its types, not all of them', () => {
    const multiType = blockFilters().filter(parsed => typeFilters(parsed).length > 1);

    expect(multiType).toHaveLength(1);
    expect(multiType[0].mode).toBe('OR');
  });

  it('leaves the single-type blocks in AND mode', () => {
    const singleType = blockFilters().filter(parsed => typeFilters(parsed).length === 1);

    expect(singleType.length).toBeGreaterThan(0);
    expect(singleType.every(parsed => parsed.mode === 'AND')).toBe(true);
  });

  it('scopes every block to the new space', () => {
    const filters = blockFilters();

    expect(filters.length).toBeGreaterThan(0);
    expect(
      filters.every(parsed =>
        parsed.filters.some(filter => filter.columnId === SystemIds.SPACE_FILTER && filter.value === SPACE_ID)
      )
    ).toBe(true);
  });

  it('hangs exactly the four overview blocks off the space home entity, in order', () => {
    const ops = templateOps();
    const names = namesById(ops);

    const blocks = overviewBlockRelations(ops).map(relation => names.get(toHex(relation.to)));

    expect(blocks).toEqual(OVERVIEW_BLOCKS.map(block => block.name));
  });

  it('orders the overview blocks by ascending position', () => {
    const positions = overviewBlockRelations(templateOps()).map(relation => relation.position);

    expect(positions.every(position => typeof position === 'string' && position.length > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort());
  });

  it('gives each overview block its view', () => {
    const ops = templateOps();
    const names = namesById(ops);
    const relations = relationOps(ops);

    const views = overviewBlockRelations(ops).map(block => {
      const view = relations.find(
        relation =>
          toHex(relation.from) === toHex(block.entity) && toHex(relation.relationType) === SystemIds.VIEW_PROPERTY
      );

      return { name: names.get(toHex(block.to)), view: view && toHex(view.to) };
    });

    expect(views).toEqual(OVERVIEW_BLOCKS);
  });
});

import { IdUtils, type Op, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import type { Relation, Value } from '~/core/types';
import { prepareLocalDataForPublishing } from '~/core/utils/publish/publish';

import { derivedSpacePageId, isPagelessSpace, repairPagelessSpacePublish, spacePageEntityId } from './space-page';

// The reporter's space from GEO-2966, before they repaired it by hand.
const PAGELESS_SPACE_ID = '7aed0e58f713f656e2933f7635f08e62';
const OTHER_SPACE_ID = 'd00460c203779d21d96fcfc6102d7a72';
const EXISTING_PAGE_ID = '73870a67151a423e97737034291dd3de';
const NAME_PROPERTY = SystemIds.NAME_PROPERTY;
const DESCRIPTION_PROPERTY = SystemIds.DESCRIPTION_PROPERTY;

const pagelessSpace = { id: PAGELESS_SPACE_ID, entity: { id: '' }, topicId: null };
const spaceWithPage = { id: PAGELESS_SPACE_ID, entity: { id: EXISTING_PAGE_ID }, topicId: null };

function value(overrides: Partial<Value> = {}): Value {
  return {
    id: IdUtils.generate(),
    entity: { id: '', name: null },
    property: { id: NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
    value: 'A test space',
    spaceId: PAGELESS_SPACE_ID,
    options: null,
    isDeleted: false,
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  };
}

function relation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    fromEntity: { id: '', name: null },
    toEntity: { id: SystemIds.PERSON_TYPE, name: 'Person', value: SystemIds.PERSON_TYPE },
    renderableType: 'RELATION',
    spaceId: PAGELESS_SPACE_ID,
    isDeleted: false,
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  };
}

type CreateRelationOp = Op & { type: 'createRelation'; id: unknown; entity: unknown; from: unknown; to: unknown };
type UpdateEntityOp = Op & { type: 'updateEntity'; id: unknown; set: Array<{ property: unknown }> };

function bytes(id: string) {
  return Array.from(IdUtils.toBytes(id));
}

function asBytes(id: unknown) {
  return Array.from(id as Uint8Array);
}

describe('derivedSpacePageId', () => {
  it('is a valid entity id', () => {
    expect(IdUtils.isValid(derivedSpacePageId(PAGELESS_SPACE_ID))).toBe(true);
  });

  it('is the same on every call, so edits survive a reload and concurrent repairs converge', () => {
    expect(derivedSpacePageId(PAGELESS_SPACE_ID)).toBe(derivedSpacePageId(PAGELESS_SPACE_ID));
  });

  it('is different for different spaces and is not the space id itself', () => {
    expect(derivedSpacePageId(PAGELESS_SPACE_ID)).not.toBe(derivedSpacePageId(OTHER_SPACE_ID));
    expect(derivedSpacePageId(PAGELESS_SPACE_ID)).not.toBe(PAGELESS_SPACE_ID);
  });
});

describe('spacePageEntityId', () => {
  it('uses the resolved page when there is one', () => {
    expect(isPagelessSpace(spaceWithPage)).toBe(false);
    expect(spacePageEntityId(spaceWithPage)).toBe(EXISTING_PAGE_ID);
  });

  it('never returns an empty id for a pageless space', () => {
    expect(isPagelessSpace(pagelessSpace)).toBe(true);
    expect(spacePageEntityId(pagelessSpace)).toBe(derivedSpacePageId(PAGELESS_SPACE_ID));
  });

  it('prefers a declared topic over a derived id', () => {
    const topicId = IdUtils.generate();
    expect(spacePageEntityId({ ...pagelessSpace, topicId })).toBe(topicId);
  });
});

describe('repairPagelessSpacePublish', () => {
  it('leaves a space that has a page untouched', () => {
    const values = [value({ entity: { id: EXISTING_PAGE_ID, name: 'Test Space' } })];
    const relations = [relation({ fromEntity: { id: EXISTING_PAGE_ID, name: 'Test Space' } })];

    const result = repairPagelessSpacePublish({ space: spaceWithPage, values, relations });

    expect(result.values).toBe(values);
    expect(result.relations).toBe(relations);
    expect(result.pageOps).toEqual([]);
  });

  it("moves rows stored against '' onto the page id and keeps their row ids", () => {
    const pageId = derivedSpacePageId(PAGELESS_SPACE_ID);
    const name = value();
    const description = value({
      property: { id: DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
      value: 'i can do whatever i want',
    });
    const types = relation();

    const result = repairPagelessSpacePublish({
      space: pagelessSpace,
      values: [name, description],
      relations: [types],
    });

    expect(result.values.map(v => v.entity.id)).toEqual([pageId, pageId]);
    expect(result.values.map(v => v.id)).toEqual([name.id, description.id]);
    expect(result.relations[0].fromEntity.id).toBe(pageId);
    expect(result.relations[0].id).toBe(types.id);
  });

  it('does not touch rows belonging to another space or another entity', () => {
    const block = value({ entity: { id: 'cf527f59303b4eadb0f0a1c657cdb812', name: null } });
    const elsewhere = value({ spaceId: OTHER_SPACE_ID });

    const result = repairPagelessSpacePublish({ space: pagelessSpace, values: [block, elsewhere], relations: [] });

    expect(result.values).toEqual([block, elsewhere]);
    expect(result.pageOps).toEqual([]);
  });

  it('types the new page as a Space so the API resolves it as space.page', () => {
    const pageId = derivedSpacePageId(PAGELESS_SPACE_ID);

    const { pageOps } = repairPagelessSpacePublish({ space: pagelessSpace, values: [value()], relations: [] });

    expect(pageOps).toHaveLength(1);
    const op = pageOps[0] as CreateRelationOp;
    expect(op.type).toBe('createRelation');
    expect(asBytes(op.from)).toEqual(bytes(pageId));
    expect(asBytes(op.to)).toEqual(bytes(SystemIds.SPACE_TYPE));
  });

  it('gives the Space type relation the same ids every time, so a second publish does not duplicate it', () => {
    const first = repairPagelessSpacePublish({ space: pagelessSpace, values: [value()], relations: [] });
    const second = repairPagelessSpacePublish({ space: pagelessSpace, values: [value()], relations: [] });

    const a = first.pageOps[0] as CreateRelationOp;
    const b = second.pageOps[0] as CreateRelationOp;
    expect(asBytes(a.id)).toEqual(asBytes(b.id));
    expect(asBytes(a.entity)).toEqual(asBytes(b.entity));
  });

  it('does not add the Space type when the publish already carries it', () => {
    const spaceType = relation({
      toEntity: { id: SystemIds.SPACE_TYPE, name: 'Space', value: SystemIds.SPACE_TYPE },
    });

    const { pageOps } = repairPagelessSpacePublish({
      space: pagelessSpace,
      values: [value()],
      relations: [spaceType],
    });

    expect(pageOps).toEqual([]);
  });

  it('adds nothing when the publish does not touch the page', () => {
    const block = value({ entity: { id: IdUtils.generate(), name: null } });

    const { pageOps } = repairPagelessSpacePublish({ space: pagelessSpace, values: [block], relations: [] });

    expect(pageOps).toEqual([]);
  });

  it("turns the reporter's rows into a real edit instead of an empty one", () => {
    // The GEO-2966 local store: Name and Description against '', plus a markdown block that had
    // an id. Before the repair only the block survived `prepareOps`.
    const pageId = derivedSpacePageId(PAGELESS_SPACE_ID);
    const rows = [
      value(),
      value({
        property: { id: DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
        value: 'i can do whatever i want',
      }),
    ];

    const unrepaired = Effect.runSync(prepareLocalDataForPublishing(rows, [], PAGELESS_SPACE_ID));
    expect(unrepaired).toEqual([]);

    const repaired = repairPagelessSpacePublish({ space: pagelessSpace, values: rows, relations: [] });
    const ops = Effect.runSync(prepareLocalDataForPublishing(repaired.values, repaired.relations, PAGELESS_SPACE_ID));

    expect(ops).toHaveLength(1);
    const update = ops[0] as UpdateEntityOp;
    expect(update.type).toBe('updateEntity');
    expect(asBytes(update.id)).toEqual(bytes(pageId));
    expect(update.set).toHaveLength(2);
  });
});

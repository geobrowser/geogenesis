// @TODO(grc-20-v2-migration): Update EntityChange and diff types to use v2 schema
import { describe, expect, it } from 'vitest';

import { EntityId } from '~/core/io/substream-schema';

import { aggregateChanges } from './change';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntityChange = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entity = any;

type TripleValueType = 'TEXT' | 'URL' | 'TIME' | 'IMAGE' | 'NUMBER' | 'CHECKBOX' | 'RELATION';

type Triple = {
  attributeId: string;
  attributeName: string;
  entityId: string;
  entityName: string;
  id: string;
  space: string;
  value: { type: TripleValueType; value: string };
};

type Relation = {
  id: string;
  space: string;
  index: string;
  fromEntity: { id: string; name: string };
  toEntity: { id: string; name: string; renderableType: string; value: string };
  typeOf: { id: string; name: string };
};

const POSITION_FIRST = 'aaaaaaaaaaaaaaaaaaaa';

function makeStubEntity(tripleFn?: () => Triple, relationFn?: () => Relation): Entity {
  return {
    id: EntityId('1'),
    spaces: [],
    types: [],
    description: null,
    name: 'Entity Name from Test',
    nameTripleSpaces: [],
    relationsOut: relationFn ? [relationFn()] : [],
    triples: tripleFn ? [tripleFn()] : [],
  };
}

function makeStubTextTriple(value: string): Triple {
  return {
    attributeId: 'text-attribute-from-test',
    attributeName: 'Text Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From Text Test',
    id: EntityId('1-1'),
    space: 'text-space-from-test',
    value: {
      type: 'TEXT',
      value: value,
    },
  };
}

function makeStubUriTriple(value: string): Triple {
  return {
    attributeId: 'uri-attribute-from-test',
    attributeName: 'URI Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From URI Test',
    id: EntityId('1-1'),
    space: 'uri-space-from-test',
    value: {
      type: 'URL',
      value: value,
    },
  };
}

function makeStubTimeTriple(value: string): Triple {
  return {
    attributeId: 'time-attribute-from-test',
    attributeName: 'Time Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From Time Test',
    id: EntityId('1-1'),
    space: 'time-space-from-test',
    value: {
      type: 'TIME',
      value: value,
    },
  };
}

function makeStubRelation(value: string): Relation {
  return {
    id: EntityId('1-1'),
    space: 'relation-space-from-test',
    index: POSITION_FIRST,
    fromEntity: {
      id: EntityId('1'),
      name: 'From Entity Name From Relation Test',
    },
    toEntity: {
      id: EntityId(value),
      name: value,
      renderableType: 'RELATION',
      value: value,
    },
    typeOf: {
      id: EntityId('TypeOf-Entity-Id-From-Relation-Test'),
      name: 'Type Of Entity Name From Relation Test',
    },
  };
}

describe.skip('Change', () => {
  it('diffs a text triple with different values', () => {
    const before = makeStubEntity(() => makeStubTextTriple('text-value-1-from-test'));
    const after = makeStubEntity(() => makeStubTextTriple('text-value-2-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        avatar: null,
        changes: [
          {
            type: 'TEXT',
            attribute: {
              id: 'text-attribute-from-test',
              name: 'Text Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-2-from-test',
              options: undefined,
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-1-from-test',
              options: undefined,
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a text triple with same values', () => {
    const before = makeStubEntity(() => makeStubTextTriple('text-value-1-from-test'));
    const after = makeStubEntity(() => makeStubTextTriple('text-value-1-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
        avatar: null,
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a uri triple with different values', () => {
    const before = makeStubEntity(() => makeStubUriTriple('uri-value-1-from-test'));
    const after = makeStubEntity(() => makeStubUriTriple('uri-value-2-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        avatar: null,
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [
          {
            type: 'URL',
            attribute: {
              id: 'uri-attribute-from-test',
              name: 'URI Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'uri-value-2-from-test',
              options: undefined,
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'uri-value-1-from-test',
              options: undefined,
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a uri triple with same values', () => {
    const before = makeStubEntity(() => makeStubUriTriple('uri-value-1-from-test'));
    const after = makeStubEntity(() => makeStubUriTriple('uri-value-1-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        avatar: null,
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a time triple with different values', () => {
    const before = makeStubEntity(() => makeStubTimeTriple('time-value-1-from-test'));
    const after = makeStubEntity(() => makeStubTimeTriple('time-value-2-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        avatar: null,
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [
          {
            type: 'TIME',
            attribute: {
              id: 'time-attribute-from-test',
              name: 'Time Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'time-value-2-from-test',
              options: undefined,
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'time-value-1-from-test',
              options: undefined,
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a time triple with same values', () => {
    const before = makeStubEntity(() => makeStubTimeTriple('time-value-1-from-test'));
    const after = makeStubEntity(() => makeStubTimeTriple('time-value-1-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        avatar: null,
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a relation with different values', () => {
    const before = makeStubEntity(undefined, () => makeStubRelation('relation-value-1-from-test'));
    const after = makeStubEntity(undefined, () => makeStubRelation('relation-value-2-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        avatar: null,
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [
          {
            type: 'RELATION',
            attribute: {
              id: 'TypeOf-Entity-Id-From-Relation-Test',
              name: 'Type Of Entity Name From Relation Test',
            },
            after: {
              type: 'UPDATE',
              valueName: 'relation-value-2-from-test',
              value: 'relation-value-2-from-test',
            },
            before: {
              type: 'UPDATE',
              valueName: 'relation-value-1-from-test',
              value: 'relation-value-1-from-test',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a relation with same values', () => {
    const before = makeStubEntity(undefined, () => makeStubRelation('relation-value-1-from-test'));
    const after = makeStubEntity(undefined, () => makeStubRelation('relation-value-1-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
      afterBlocks: [],
      beforeBlocks: [],
      parentEntityIds: {},
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        avatar: null,
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });
});

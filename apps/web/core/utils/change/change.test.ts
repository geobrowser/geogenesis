import { describe, expect, it } from 'vitest';

import { Entity, Relation } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Triple } from '~/core/types';

import { aggregateChanges } from './change';
import { EntityChange } from './types';

function makeStubEntity(tripleFn?: () => Triple, relationFn?: () => Relation): Entity {
  return {
    id: EntityId('1'),
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
      type: 'URI',
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

function makeStubEntityTriple(value: string): Triple {
  return {
    attributeId: 'entity-attribute-from-test',
    attributeName: 'Entity Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From Entity Test',
    id: EntityId('1-1'),
    space: 'entity-space-from-test',
    value: {
      type: 'ENTITY',
      value: value,
      name: value,
    },
  };
}

function makeStubRelation(value: string): Relation {
  return {
    id: EntityId('1-1'),
    index: 'a0',
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

describe('Change', () => {
  it('diffs a text triple with different values', () => {
    const before = makeStubEntity(() => makeStubTextTriple('text-value-1-from-test'));
    const after = makeStubEntity(() => makeStubTextTriple('text-value-2-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
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
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-1-from-test',
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [
          {
            type: 'URI',
            attribute: {
              id: 'uri-attribute-from-test',
              name: 'URI Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'uri-value-2-from-test',
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'uri-value-1-from-test',
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
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
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'time-value-1-from-test',
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs an entity triple with different values', () => {
    const before = makeStubEntity(() => makeStubEntityTriple('entity-value-1-from-test'));
    const after = makeStubEntity(() => makeStubEntityTriple('entity-value-2-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [
          {
            type: 'ENTITY',
            attribute: {
              id: 'entity-attribute-from-test',
              name: 'Entity Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: 'entity-value-2-from-test',
              value: 'entity-value-2-from-test',
            },
            before: {
              type: 'UPDATE',
              valueName: 'entity-value-1-from-test',
              value: 'entity-value-1-from-test',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs an entity triple with same values', () => {
    const before = makeStubEntity(() => makeStubEntityTriple('entity-value-1-from-test'));
    const after = makeStubEntity(() => makeStubEntityTriple('entity-value-1-from-test'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
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
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name from Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });
});

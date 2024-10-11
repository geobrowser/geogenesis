import { describe, expect, it } from 'vitest';

import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Triple } from '~/core/types';

import { aggregateChanges } from './change';
import { EntityChange } from './types';

function makeStubEntity(tripleFn: () => Triple): Entity {
  return {
    id: EntityId('1'),
    types: [],
    description: null,
    name: 'Entity Name From Text Test',
    nameTripleSpaces: [],
    relationsOut: [],
    triples: [tripleFn()],
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
    attributeId: 'text-attribute-from-test',
    attributeName: 'Text Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From URI Test',
    id: EntityId('1-1'),
    space: 'text-space-from-test',
    value: {
      type: 'URI',
      value: value,
    },
  };
}

function makeStubTimeTriple(value: string): Triple {
  return {
    attributeId: 'text-attribute-from-test',
    attributeName: 'Text Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From URI Test',
    id: EntityId('1-1'),
    space: 'text-space-from-test',
    value: {
      type: 'TIME',
      value: value,
    },
  };
}

function makeStubEntityTriple(value: string): Triple {
  return {
    attributeId: 'text-attribute-from-test',
    attributeName: 'Text Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From URI Test',
    id: EntityId('1-1'),
    space: 'text-space-from-test',
    value: {
      type: 'ENTITY',
      value: value,
      name: value,
    },
  };
}

describe('Change', () => {
  it('diffs a text triple with different values', () => {
    const before = makeStubEntity(() => makeStubTextTriple('text-value-1-from-text'));
    const after = makeStubEntity(() => makeStubTextTriple('text-value-2-from-text'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
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
              value: 'text-value-2-from-text',
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-1-from-text',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a text triple with same values', () => {
    const before = makeStubEntity(() => makeStubTextTriple('text-value-1-from-text'));
    const after = makeStubEntity(() => makeStubTextTriple('text-value-1-from-text'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a uri triple with different values', () => {
    const before = makeStubEntity(() => makeStubUriTriple('text-value-1-from-text'));
    const after = makeStubEntity(() => makeStubUriTriple('text-value-2-from-text'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [
          {
            type: 'URI',
            attribute: {
              id: 'text-attribute-from-test',
              name: 'Text Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-2-from-text',
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-1-from-text',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a uri triple with same values', () => {
    const before = makeStubEntity(() => makeStubUriTriple('text-value-1-from-text'));
    const after = makeStubEntity(() => makeStubUriTriple('text-value-1-from-text'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a time triple with different values', () => {
    const before = makeStubEntity(() => makeStubTimeTriple('text-value-1-from-text'));
    const after = makeStubEntity(() => makeStubTimeTriple('text-value-2-from-text'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [
          {
            type: 'TIME',
            attribute: {
              id: 'text-attribute-from-test',
              name: 'Text Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-2-from-text',
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-1-from-text',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs a time triple with same values', () => {
    const before = makeStubEntity(() => makeStubTimeTriple('text-value-1-from-text'));
    const after = makeStubEntity(() => makeStubTimeTriple('text-value-1-from-text'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs an entity triple with different values', () => {
    const before = makeStubEntity(() => makeStubEntityTriple('entity-value-1-from-entity'));
    const after = makeStubEntity(() => makeStubEntityTriple('entity-value-2-from-entity'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [
          {
            type: 'ENTITY',
            attribute: {
              id: 'text-attribute-from-test',
              name: 'Text Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: 'entity-value-2-from-entity',
              value: 'entity-value-2-from-entity',
            },
            before: {
              type: 'UPDATE',
              valueName: 'entity-value-1-from-entity',
              value: 'entity-value-1-from-entity',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });

  it('diffs an entity triple with same values', () => {
    const before = makeStubEntity(() => makeStubEntityTriple('entity-value-1-from-entity'));
    const after = makeStubEntity(() => makeStubEntityTriple('entity-value-1-from-entity'));

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });
});

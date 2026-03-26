import { describe, expect, it } from 'vitest';

import { buildImageValuesAndRelations, collectImageTasks, isValidImageUrl } from './image-upload';

describe('isValidImageUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidImageUrl('http://example.com/img.png')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidImageUrl('https://example.com/img.png')).toBe(true);
  });

  it('accepts ipfs:// URLs', () => {
    expect(isValidImageUrl('ipfs://bafkreiabc123')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidImageUrl('')).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isValidImageUrl('not-a-url')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isValidImageUrl('HTTPS://EXAMPLE.COM/IMG.PNG')).toBe(true);
    expect(isValidImageUrl('IPFS://BAFKREI')).toBe(true);
  });
});

describe('collectImageTasks', () => {
  const imageProperty = {
    id: 'prop-image',
    name: 'Avatar',
    dataType: 'RELATION' as const,
    renderableTypeStrict: 'IMAGE' as const,
    relationValueTypes: [],
  };

  const propertyLookup = {
    schema: [imageProperty],
    extraProperties: {},
    getProperty: () => null,
  };

  it('collects tasks for IMAGE columns with valid URLs', () => {
    const { tasks } = collectImageTasks({
      dataRows: [
        ['Entity A', 'https://example.com/a.png'],
        ['Entity B', 'https://example.com/b.png'],
      ],
      columnMapping: { 0: 'name-prop', 1: imageProperty.id },
      resolvedRows: new Map([
        [0, { entityId: 'e1', name: 'Entity A' }],
        [1, { entityId: 'e2', name: 'Entity B' }],
      ]),
      propertyLookup,
    });

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      rowIndex: 0,
      colIdx: 1,
      propertyId: 'prop-image',
      url: 'https://example.com/a.png',
      fromEntityId: 'e1',
    });
  });

  it('skips rows without resolved entities', () => {
    const { tasks } = collectImageTasks({
      dataRows: [['Entity A', 'https://example.com/a.png']],
      columnMapping: { 0: 'name-prop', 1: imageProperty.id },
      resolvedRows: new Map(),
      propertyLookup,
    });

    expect(tasks).toHaveLength(0);
  });

  it('skips empty cells', () => {
    const { tasks } = collectImageTasks({
      dataRows: [['Entity A', '']],
      columnMapping: { 0: 'name-prop', 1: imageProperty.id },
      resolvedRows: new Map([[0, { entityId: 'e1', name: 'Entity A' }]]),
      propertyLookup,
    });

    expect(tasks).toHaveLength(0);
  });

  it('flags invalid URLs instead of silently dropping them', () => {
    const { tasks, flags } = collectImageTasks({
      dataRows: [['Entity A', 'not-a-url']],
      columnMapping: { 0: 'name-prop', 1: imageProperty.id },
      resolvedRows: new Map([[0, { entityId: 'e1', name: 'Entity A' }]]),
      propertyLookup,
    });

    expect(tasks).toHaveLength(0);
    expect(flags['0:1']).toMatchObject({ kind: 'image-invalid', rawValue: 'not-a-url' });
  });

  it('collects ipfs:// URLs', () => {
    const { tasks } = collectImageTasks({
      dataRows: [['Entity A', 'ipfs://bafkreiabc123']],
      columnMapping: { 0: 'name-prop', 1: imageProperty.id },
      resolvedRows: new Map([[0, { entityId: 'e1', name: 'Entity A' }]]),
      propertyLookup,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].url).toBe('ipfs://bafkreiabc123');
  });

  it('ignores non-IMAGE relation columns', () => {
    const nonImageProperty = {
      id: 'prop-rel',
      name: 'Related',
      dataType: 'RELATION' as const,
      relationValueTypes: [],
    };

    const { tasks } = collectImageTasks({
      dataRows: [['Entity A', 'https://example.com/a.png']],
      columnMapping: { 0: 'name-prop', 1: nonImageProperty.id },
      resolvedRows: new Map([[0, { entityId: 'e1', name: 'Entity A' }]]),
      propertyLookup: {
        schema: [nonImageProperty],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    expect(tasks).toHaveLength(0);
  });
});

describe('buildImageValuesAndRelations', () => {
  it('generates linking relations from current resolved rows', () => {
    const cache = {
      '0:1': {
        imageEntityId: 'img-entity-1',
        propertyId: 'avatar-prop',
        propertyName: 'Avatar',
        values: [
          {
            id: 'val-1',
            entity: { id: 'img-entity-1', name: null },
            property: { id: 'image-url-prop', name: 'Image URL', dataType: 'TEXT' as const, renderableType: 'URL' as const },
            spaceId: 'space-1',
            value: 'ipfs://bafkrei123',
            isLocal: true,
          },
        ],
        relations: [],
      },
    };

    const result = buildImageValuesAndRelations({
      cache,
      resolvedRows: new Map([[0, { entityId: 'row-entity-1', name: 'Lion' }]]),
      spaceId: 'space-1',
    });

    // Image entity value + linking relation
    expect(result.values).toHaveLength(1);
    expect(result.values[0].value).toBe('ipfs://bafkrei123');

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].fromEntity.id).toBe('row-entity-1');
    expect(result.relations[0].toEntity.id).toBe('img-entity-1');
    expect(result.relations[0].type.id).toBe('avatar-prop');
    expect(result.relations[0].renderableType).toBe('IMAGE');
  });

  it('uses updated entity IDs after row override', () => {
    const cache = {
      '0:1': {
        imageEntityId: 'img-entity-1',
        propertyId: 'avatar-prop',
        propertyName: 'Avatar',
        values: [],
        relations: [],
      },
    };

    // Simulate a row override that changed the entity ID
    const result = buildImageValuesAndRelations({
      cache,
      resolvedRows: new Map([[0, { entityId: 'overridden-entity', name: 'Lion (overridden)' }]]),
      spaceId: 'space-1',
    });

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].fromEntity.id).toBe('overridden-entity');
    expect(result.relations[0].fromEntity.name).toBe('Lion (overridden)');
  });

  it('skips linking relation for unresolved rows', () => {
    const cache = {
      '0:1': {
        imageEntityId: 'img-entity-1',
        propertyId: 'avatar-prop',
        propertyName: 'Avatar',
        values: [
          {
            id: 'val-1',
            entity: { id: 'img-entity-1', name: null },
            property: { id: 'image-url-prop', name: 'Image URL', dataType: 'TEXT' as const },
            spaceId: 'space-1',
            value: 'ipfs://bafkrei123',
            isLocal: true,
          },
        ],
        relations: [],
      },
    };

    const result = buildImageValuesAndRelations({
      cache,
      resolvedRows: new Map(), // row 0 not resolved
      spaceId: 'space-1',
    });

    // Image entity values are still included, but no linking relation
    expect(result.values).toHaveLength(1);
    expect(result.relations).toHaveLength(0);
  });
});

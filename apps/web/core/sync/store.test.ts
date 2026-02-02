import { SystemIds } from '@geoprotocol/geo-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RENDERABLE_TYPE_PROPERTY } from '../constants';
import { DataType, Entity, Relation, Value } from '../types';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from './store';
import { GeoEventStream } from './stream';

// Mock external dependencies to avoid circular imports
vi.mock('./use-sync-engine.tsx', () => ({}));
vi.mock('./use-store.tsx', () => ({}));

// Mock GeoEventStream
const mockStream = {
  on: vi.fn(),
  emit: vi.fn(),
} as unknown as GeoEventStream;

// Mock console.log for development environment tests
const originalEnv = process.env.NODE_ENV;
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

// Test data
const mockEntity1: Entity = {
  id: 'entity-1',
  name: 'Test Entity 1',
  description: 'A test entity',
  spaces: ['space-1'],
  types: [{ id: 'type-1', name: 'Test Type' }],
  relations: [],
  values: [],
};

const mockEntity2: Entity = {
  id: 'entity-2',
  name: 'Test Entity 2',
  description: 'Another test entity',
  spaces: ['space-2'],
  types: [{ id: 'type-2', name: 'Another Type' }],
  relations: [],
  values: [],
};

const mockValue1: Value = {
  id: 'value-1',
  entity: { id: 'entity-1', name: 'Test Entity 1' },
  property: {
    id: 'prop-1',
    name: 'Test Property',
    dataType: 'TEXT',
  },
  value: 'test value',
  spaceId: 'space-1',
  timestamp: '2023-01-01T00:00:00Z',
  isDeleted: false,
  isLocal: false,
  hasBeenPublished: true,
};

const mockValue2: Value = {
  id: 'value-2',
  entity: { id: 'entity-1', name: 'Test Entity 1' },
  property: {
    id: 'prop-2',
    name: 'Another Property',
    dataType: 'NUMBER',
  },
  value: '42',
  spaceId: 'space-1',
  timestamp: '2023-01-02T00:00:00Z',
  isDeleted: true,
  isLocal: true,
  hasBeenPublished: false,
};

const mockRelation1: Relation = {
  id: 'relation-1',
  entityId: 'entity-1',
  type: { id: 'relation-type-1', name: 'Test Relation Type' },
  fromEntity: { id: 'entity-1', name: 'Test Entity 1' },
  toEntity: { id: 'entity-2', name: 'Test Entity 2', value: 'entity-2' },
  renderableType: 'RELATION',
  position: '1',
  verified: true,
  spaceId: 'space-1',
  timestamp: '2023-01-01T00:00:00Z',
  isDeleted: false,
  isLocal: false,
  hasBeenPublished: true,
};

const mockRelation2: Relation = {
  id: 'relation-2',
  entityId: 'entity-1',
  type: { id: 'relation-type-2', name: 'Another Relation Type' },
  fromEntity: { id: 'entity-1', name: 'Test Entity 1' },
  toEntity: { id: 'entity-3', name: 'Test Entity 3', value: 'entity-3' },
  renderableType: 'RELATION',
  position: '2',
  verified: false,
  spaceId: 'space-2',
  timestamp: '2023-01-02T00:00:00Z',
  isDeleted: true,
  isLocal: true,
  hasBeenPublished: false,
};

const mockDataType: DataType = 'TEXT';

describe('GeoStore', () => {
  let store: GeoStore;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear reactive stores
    reactiveValues.set([]);
    reactiveRelations.set([]);
    syncedEntities.clear();

    // Create fresh store instance
    store = new GeoStore(mockStream);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('constructor', () => {
    it('should set up event listener for ENTITIES_SYNCED', () => {
      expect(mockStream.on).toHaveBeenCalledWith(GeoEventStream.ENTITIES_SYNCED, expect.any(Function));
    });
  });

  describe('syncEntities', () => {
    it('should hydrate store with entities', () => {
      const entities = [mockEntity1, mockEntity2];

      store.syncEntities(entities);

      expect(syncedEntities.get('entity-1')).toEqual(mockEntity1);
      expect(syncedEntities.get('entity-2')).toEqual(mockEntity2);
    });

    it('should log entity IDs in development environment', () => {
      process.env.NODE_ENV = 'development';
      const entities = [mockEntity1, mockEntity2];

      store.syncEntities(entities);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Finished syncing entities to store'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('entity-1, entity-2'));
    });

    it('should not log in production environment', () => {
      process.env.NODE_ENV = 'production';
      const entities = [mockEntity1];

      store.syncEntities(entities);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all data and emit hydrate event', () => {
      // Set up some initial data
      syncedEntities.set('entity-1', mockEntity1);
      store.setDataType('prop-1', mockDataType);

      store.clear();

      expect(mockStream.emit).toHaveBeenCalledWith({
        type: GeoEventStream.HYDRATE,
        entities: ['entity-1'],
      });
    });
  });

  describe('hydrateWith', () => {
    it('should update synced entities, values, and relations', () => {
      const entitiesWithData = [
        {
          ...mockEntity1,
          values: [mockValue1],
          relations: [mockRelation1],
        },
      ];

      store.hydrateWith(entitiesWithData);

      expect(syncedEntities.get('entity-1')).toEqual(entitiesWithData[0]);
      expect(reactiveValues.get()).toContain(mockValue1);
      expect(reactiveRelations.get()).toContain(mockRelation1);
    });

    it('should replace existing values and relations with same ID', () => {
      // Set initial data
      reactiveValues.set([mockValue1]);
      reactiveRelations.set([mockRelation1]);

      const updatedValue = { ...mockValue1, value: 'updated value' };
      const updatedRelation = { ...mockRelation1, verified: false };

      const entitiesWithUpdatedData = [
        {
          ...mockEntity1,
          values: [updatedValue],
          relations: [updatedRelation],
        },
      ];

      store.hydrateWith(entitiesWithUpdatedData);

      const values = reactiveValues.get();
      const relations = reactiveRelations.get();

      expect(values).toHaveLength(1);
      expect(values[0].value).toBe('updated value');
      expect(relations).toHaveLength(1);
      expect(relations[0].verified).toBe(false);
    });
  });

  describe('getEntity', () => {
    beforeEach(() => {
      syncedEntities.set('entity-1', mockEntity1);
      reactiveValues.set([mockValue1, mockValue2]);
      reactiveRelations.set([mockRelation1, mockRelation2]);
    });

    it('should return entity with resolved values and relations', () => {
      const entity = store.getEntity('entity-1');

      expect(entity).toBeDefined();
      expect(entity!.id).toBe('entity-1');
      expect(entity!.values).toHaveLength(1); // Only non-deleted values by default
      expect(entity!.relations).toHaveLength(1); // Deleted relations are filtered out by default
    });

    it('should filter out deleted values and relations by default', () => {
      const entity = store.getEntity('entity-1');

      const nonDeletedValues = entity!.values.filter(v => !v.isDeleted);
      const nonDeletedRelations = entity!.relations.filter(r => !r.isDeleted);

      expect(nonDeletedValues).toHaveLength(1);
      expect(nonDeletedRelations).toHaveLength(1);
    });

    it('should include deleted items when includeDeleted is true', () => {
      const entity = store.getEntity('entity-1', { includeDeleted: true });

      expect(entity!.values).toHaveLength(2);
      expect(entity!.relations).toHaveLength(2);
    });

    it('should filter by spaceId when provided', () => {
      const entity = store.getEntity('entity-1', { spaceId: 'space-1' });

      expect(entity!.values).toHaveLength(1);
      expect(entity!.values[0].spaceId).toBe('space-1');
    });

    it('should return undefined for non-existent entity', () => {
      const entity = store.getEntity('non-existent');

      expect(entity).toBeUndefined();
    });
  });

  describe('getEntities', () => {
    it('should return all entities', () => {
      syncedEntities.set('entity-1', mockEntity1);
      syncedEntities.set('entity-2', mockEntity2);

      const entities = store.getEntities();

      expect(entities).toHaveLength(2);
      expect(entities.map(e => e.id)).toEqual(['entity-1', 'entity-2']);
    });
  });

  describe('getResolvedValues', () => {
    beforeEach(() => {
      reactiveValues.set([mockValue1, mockValue2]);
    });

    it('should return values for specific entity', () => {
      const values = store.getResolvedValues('entity-1');

      expect(values).toHaveLength(1);
      expect(values[0].isDeleted).toBe(false);
    });

    it('should include deleted values when includeDeleted is true', () => {
      const values = store.getResolvedValues('entity-1', true);

      expect(values).toHaveLength(2);
    });
  });

  describe('getValue', () => {
    beforeEach(() => {
      reactiveValues.set([mockValue1]);
    });

    it('should return specific value by ID', () => {
      const value = store.getValue('value-1', 'entity-1');

      expect(value).toEqual(mockValue1);
    });

    it('should return null for non-existent value', () => {
      const value = store.getValue('non-existent', 'entity-1');

      expect(value).toBeNull();
    });
  });

  describe('getRelation', () => {
    beforeEach(() => {
      reactiveRelations.set([mockRelation1]);
    });

    it('should return specific relation by ID', () => {
      const relation = store.getRelation('relation-1', 'entity-1');

      expect(relation).toEqual(mockRelation1);
    });

    it('should return null for non-existent relation', () => {
      const relation = store.getRelation('non-existent', 'entity-1');

      expect(relation).toBeNull();
    });
  });

  describe('setDataType', () => {
    it('should set data type and emit event', () => {
      store.setDataType('prop-1', mockDataType);

      expect(mockStream.emit).toHaveBeenCalledWith({
        type: GeoEventStream.DATA_TYPE_CREATED,
        property: { id: 'prop-1', dataType: mockDataType },
      });
    });
  });

  describe('getProperty', () => {
    beforeEach(() => {
      const propertyEntity = {
        id: 'prop-1',
        name: 'Test Property',
        description: null,
        spaces: [],
        types: [],
        relations: [
          {
            ...mockRelation1,
            id: 'relation-value-type',
            fromEntity: { id: 'prop-1', name: 'Test Property' },
            type: { id: SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE, name: 'Relation Value Type' },
            toEntity: { id: 'value-type-1', name: 'Value Type 1', value: 'value-type-1' },
          },
          {
            ...mockRelation1,
            id: 'relation-renderable',
            fromEntity: { id: 'prop-1', name: 'Test Property' },
            type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
            toEntity: { id: SystemIds.URL, name: 'URL', value: SystemIds.URL },
          },
        ],
        values: [],
      };
      syncedEntities.set('prop-1', propertyEntity);
      reactiveRelations.set([
        {
          ...mockRelation1,
          id: 'relation-value-type',
          entityId: 'prop-1',
          fromEntity: { id: 'prop-1', name: 'Test Property' },
          type: { id: SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE, name: 'Relation Value Type' },
          toEntity: { id: 'value-type-1', name: 'Value Type 1', value: 'value-type-1' },
        },
        {
          ...mockRelation1,
          id: 'relation-renderable',
          entityId: 'prop-1',
          fromEntity: { id: 'prop-1', name: 'Test Property' },
          type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
          toEntity: { id: SystemIds.URL, name: 'URL', value: SystemIds.URL },
        },
      ]);
      store.setDataType('prop-1', mockDataType);
    });

    it('should return property with data type', () => {
      const property = store.getProperty('prop-1');

      expect(property).toBeDefined();
      expect(property!.id).toBe('prop-1');
      expect(property!.dataType).toBe(mockDataType);
      expect(property!.isDataTypeEditable).toBe(true);
    });

    it('should include relation value types', () => {
      const property = store.getProperty('prop-1');

      expect(property!.relationValueTypes).toHaveLength(1);
      expect(property!.relationValueTypes![0]).toEqual({
        id: 'value-type-1',
        name: 'Value Type 1',
      });
    });

    it('should map renderable type correctly', () => {
      const property = store.getProperty('prop-1');

      expect(property!.renderableType).toBe(SystemIds.URL);
    });

    it('should return null for non-existent property', () => {
      const property = store.getProperty('non-existent');

      expect(property).toBeNull();
    });
  });

  describe('getStableDataType', () => {
    it('should return null for non-existent data type', () => {
      const dataType = store.getStableDataType('prop-1');

      expect(dataType).toBeNull();
    });
  });

  describe('getResolvedRelations', () => {
    beforeEach(() => {
      reactiveRelations.set([mockRelation1, mockRelation2]);
    });

    it('should return relations for specific entity', () => {
      const relations = store.getResolvedRelations('entity-1');

      expect(relations).toHaveLength(1); // Only non-deleted relations
    });

    it('should filter out deleted relations by default', () => {
      const relations = store.getResolvedRelations('entity-1');

      // The implementation now correctly filters out deleted relations
      expect(relations).toHaveLength(1);
    });
  });

  describe('setValue', () => {
    it('should add value with optimistic updates and emit event', () => {
      const newValue = { ...mockValue1, id: 'new-value' };

      store.setValue(newValue);

      const values = reactiveValues.get();
      const addedValue = values.find(v => v.id === 'new-value');

      expect(addedValue).toBeDefined();
      expect(addedValue!.isLocal).toBe(true);
      expect(addedValue!.hasBeenPublished).toBe(false);
      expect(addedValue!.isDeleted).toBe(false);

      expect(mockStream.emit).toHaveBeenCalledWith({
        type: GeoEventStream.VALUES_CREATED,
        value: expect.objectContaining({ id: 'new-value' }),
      });
    });

    it('should replace existing value with same ID', () => {
      reactiveValues.set([mockValue1]);

      const updatedValue = { ...mockValue1, value: 'updated' };
      store.setValue(updatedValue);

      const values = reactiveValues.get();
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe('updated');
    });
  });

  describe('deleteValue', () => {
    it('should mark value as deleted and emit event', () => {
      store.deleteValue(mockValue1);

      const values = reactiveValues.get();
      const deletedValue = values.find(v => v.id === 'value-1');

      expect(deletedValue).toBeDefined();
      expect(deletedValue!.isDeleted).toBe(true);
      expect(deletedValue!.isLocal).toBe(true);
      expect(deletedValue!.hasBeenPublished).toBe(false);

      expect(mockStream.emit).toHaveBeenCalledWith({
        type: GeoEventStream.VALUES_DELETED,
        value: expect.objectContaining({ isDeleted: true }),
      });
    });
  });

  describe('setRelation', () => {
    it('should add relation with optimistic updates and emit event', () => {
      const newRelation = { ...mockRelation1, id: 'new-relation' };

      store.setRelation(newRelation);

      const relations = reactiveRelations.get();
      const addedRelation = relations.find(r => r.id === 'new-relation');

      expect(addedRelation).toBeDefined();
      expect(addedRelation!.isLocal).toBe(true);
      expect(addedRelation!.hasBeenPublished).toBe(false);
      expect(addedRelation!.isDeleted).toBe(false);

      expect(mockStream.emit).toHaveBeenCalledWith({
        type: GeoEventStream.RELATION_CREATED,
        relation: expect.objectContaining({ id: 'new-relation' }),
      });
    });
  });

  describe('deleteRelation', () => {
    it('should mark relation as deleted and emit event', () => {
      store.deleteRelation(mockRelation1);

      const relations = reactiveRelations.get();
      const deletedRelation = relations.find(r => r.id === 'relation-1');

      expect(deletedRelation).toBeDefined();
      expect(deletedRelation!.isDeleted).toBe(true);
      expect(deletedRelation!.isLocal).toBe(true);
      expect(deletedRelation!.hasBeenPublished).toBe(false);

      expect(mockStream.emit).toHaveBeenCalledWith({
        type: GeoEventStream.RELATION_DELETED,
        relation: expect.objectContaining({ isDeleted: true }),
      });
    });
  });

  describe('findReferencingEntities', () => {
    beforeEach(() => {
      reactiveRelations.set([
        mockRelation1, // fromEntity: entity-1, toEntity: entity-2
        {
          ...mockRelation1,
          id: 'relation-3',
          fromEntity: { id: 'entity-3', name: 'Entity 3' },
          toEntity: { id: 'entity-2', name: 'Entity 2', value: 'entity-2' },
        },
      ]);
    });

    it('should find entities that reference the given entity', () => {
      const referencingEntities = store.findReferencingEntities('entity-2');

      expect(referencingEntities).toEqual(['entity-1', 'entity-3']);
    });

    it('should return empty array for entity with no references', () => {
      const referencingEntities = store.findReferencingEntities('entity-1');

      expect(referencingEntities).toEqual([]);
    });
  });

  describe('setAsPublished', () => {
    it('should mark specified values and relations as published', () => {
      // Set up test data with explicit unpublished state
      const testValue1: Value = {
        id: 'test-value-1',
        entity: { id: 'entity-1', name: 'Test Entity 1' },
        property: { id: 'prop-1', name: 'Test Property', dataType: 'TEXT' },
        value: 'test value',
        spaceId: 'space-1',
        timestamp: '2023-01-01T00:00:00Z',
        isDeleted: false,
        isLocal: true,
        hasBeenPublished: false,
      };

      const testValue2: Value = {
        id: 'test-value-2',
        entity: { id: 'entity-2', name: 'Test Entity 2' },
        property: { id: 'prop-2', name: 'Another Property', dataType: 'NUMBER' },
        value: '42',
        spaceId: 'space-1',
        timestamp: '2023-01-02T00:00:00Z',
        isDeleted: false,
        isLocal: true,
        hasBeenPublished: false,
      };

      const testRelation1: Relation = {
        id: 'test-relation-1',
        entityId: 'entity-1',
        type: { id: 'relation-type-1', name: 'Test Relation Type' },
        fromEntity: { id: 'entity-1', name: 'Test Entity 1' },
        toEntity: { id: 'entity-2', name: 'Test Entity 2', value: 'entity-2' },
        renderableType: 'RELATION',
        position: '1',
        verified: true,
        spaceId: 'space-1',
        timestamp: '2023-01-01T00:00:00Z',
        isDeleted: false,
        isLocal: true,
        hasBeenPublished: false,
      };

      const testRelation2: Relation = {
        id: 'test-relation-2',
        entityId: 'entity-2',
        type: { id: 'relation-type-2', name: 'Another Relation Type' },
        fromEntity: { id: 'entity-2', name: 'Test Entity 2' },
        toEntity: { id: 'entity-3', name: 'Test Entity 3', value: 'entity-3' },
        renderableType: 'RELATION',
        position: '2',
        verified: false,
        spaceId: 'space-2',
        timestamp: '2023-01-02T00:00:00Z',
        isDeleted: false,
        isLocal: true,
        hasBeenPublished: false,
      };

      // Set up reactive stores with test data
      reactiveValues.set([testValue1, testValue2]);
      reactiveRelations.set([testRelation1, testRelation2]);

      store.setAsPublished(['test-value-1'], ['test-relation-1']);

      // Get updated values and relations
      const values = reactiveValues.get();
      const relations = reactiveRelations.get();

      const publishedValue = values.find(v => v.id === 'test-value-1');
      const unpublishedValue = values.find(v => v.id === 'test-value-2');
      const publishedRelation = relations.find(r => r.id === 'test-relation-1');
      const unpublishedRelation = relations.find(r => r.id === 'test-relation-2');

      // Verify the results
      expect(publishedValue).toBeDefined();
      expect(unpublishedValue).toBeDefined();
      expect(publishedRelation).toBeDefined();
      expect(unpublishedRelation).toBeDefined();

      expect(publishedValue!.hasBeenPublished).toBe(true);
      expect(unpublishedValue!.hasBeenPublished).toBe(false);
      expect(publishedRelation!.hasBeenPublished).toBe(true);
      expect(unpublishedRelation!.hasBeenPublished).toBe(false);
    });
  });

  describe('static methods', () => {
    describe('queryKey', () => {
      it('should return query key for entity', () => {
        const key = GeoStore.queryKey('entity-1');
        expect(key).toEqual(['store', 'entity', 'entity-1']);
      });

      it('should return query key without ID', () => {
        const key = GeoStore.queryKey();
        expect(key).toEqual(['store', 'entity', undefined]);
      });
    });

    describe('queryKeys', () => {
      it('should return query keys for entities query', () => {
        const where = { id: { equals: 'entity-1' } };
        const keys = GeoStore.queryKeys(where, 10, 0);

        // Uses stableStringify for deterministic key order
        expect(keys).toEqual(['store', 'entities', '{"id":{"equals":"entity-1"}}', 10, 0]);
      });

      it('should produce consistent keys regardless of object key order', () => {
        const where1 = { name: { equals: 'test' }, id: { equals: 'entity-1' } };
        const where2 = { id: { equals: 'entity-1' }, name: { equals: 'test' } };

        const keys1 = GeoStore.queryKeys(where1, 10, 0);
        const keys2 = GeoStore.queryKeys(where2, 10, 0);

        expect(keys1).toEqual(keys2);
      });
    });
  });
});

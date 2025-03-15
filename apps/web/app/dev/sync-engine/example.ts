import { EntityId } from '../../../core/database/types';
import { Triple } from '../../../core/database/Triple';
import { Relation } from '../../../core/database/Relation';
import { Entity } from '../../../core/database/entities';
import { createSyncEngine } from './sync-engine';

/**
 * Example showing how to use the sync engine with optimistic updates
 */
async function syncEngineExample() {
  // Set up some example data
  const entity1Id = "entity1" as unknown as EntityId;
  const entity2Id = "entity2" as unknown as EntityId;
  const attributeId = "attr1" as unknown as EntityId;
  const relationTypeId = "relationtype1" as unknown as EntityId;

  // Create initial mock data for our remote source
  const mockData = {
    entities: [
      {
        id: entity1Id,
        name: "Entity 1",
        description: "This is entity 1",
        nameTripleSpaces: ["space1"],
        spaces: ["space1"],
        types: [{ id: "type1" as unknown as EntityId, name: "Type 1" }],
        triples: [],
        relationsOut: []
      },
      {
        id: entity2Id,
        name: "Entity 2",
        description: "This is entity 2",
        nameTripleSpaces: ["space1"],
        spaces: ["space1"],
        types: [{ id: "type2" as unknown as EntityId, name: "Type 2" }],
        triples: [],
        relationsOut: []
      }
    ],
    triples: {
      [entity1Id as string]: [
        {
          space: "space1",
          entityId: entity1Id as string,
          attributeId: attributeId as string,
          value: { type: 'TEXT', value: 'Initial value' },
          entityName: "Entity 1",
          attributeName: "Attribute 1"
        }
      ]
    },
    relations: {}
  };

  // Create the sync engine with our mock data
  const { store, syncEngine, remoteSource } = createSyncEngine(mockData);

  // Set up subscription to sync events
  syncEngine.subscribe('sync:started', () => {
    console.log('Sync started');
  });

  syncEngine.subscribe('entity:synced', (id) => {
    console.log(`Entity ${id} synced`);
  });

  syncEngine.subscribe('sync:completed', () => {
    console.log('Sync completed');
  });

  // Example 1: Read an entity with all its relations
  console.log('Example 1: Initial entity state');
  await syncEngine.queueEntitySync(entity1Id);
  const entity1 = store.getEntity(entity1Id);
  console.log(entity1);

  // Example 2: Optimistically update a triple
  console.log('\nExample 2: Optimistically update a triple');
  const updatedTriple: Triple = {
    space: "space1",
    entityId: entity1Id as string,
    attributeId: attributeId as string,
    value: { type: 'TEXT', value: 'Updated value' },
    entityName: "Entity 1",
    attributeName: "Attribute 1"
  };
  
  syncEngine.setTriple(updatedTriple);
  
  // The store should immediately reflect the change
  const updatedEntity1 = store.getEntity(entity1Id);
  console.log('Entity with optimistically updated triple:');
  console.log(updatedEntity1?.triples);
  
  // Example 3: Optimistically add a relation
  console.log('\nExample 3: Optimistically add a relation');
  const newRelation: Relation = {
    space: "space1",
    id: "relation1" as unknown as EntityId,
    index: "0",
    typeOf: {
      id: relationTypeId,
      name: "Relation Type 1"
    },
    fromEntity: {
      id: entity1Id,
      name: "Entity 1"
    },
    toEntity: {
      id: entity2Id,
      name: "Entity 2",
      renderableType: 'TEXT',
      value: "Entity 2"
    }
  };
  
  syncEngine.setRelation(newRelation);
  
  // The store should immediately reflect the relation
  const entityWithRelation = store.getEntity(entity1Id);
  console.log('Entity with optimistically added relation:');
  console.log(entityWithRelation?.relationsOut);
  
  // Example 4: Update the related entity and verify automatic reference updates
  console.log('\nExample 4: Update a related entity and check reference updates');
  const updatedEntity2 = {
    ...store.getEntity(entity2Id)!,
    name: "Entity 2 - Updated Name"
  };
  
  syncEngine.createOrUpdateEntity(updatedEntity2);
  
  // Wait a moment for the reference update to process
  setTimeout(() => {
    // The relation in entity1 should have the updated name for entity2
    const entityWithUpdatedRelation = store.getEntity(entity1Id);
    console.log('Entity with auto-updated relation reference:');
    console.log(entityWithUpdatedRelation?.relationsOut[0].toEntity.name);
    
    // Example 5: Delete an entity
    console.log('\nExample 5: Delete an entity');
    syncEngine.deleteEntity(entity2Id);
    
    // Check that the entity is marked as deleted
    const deletedEntity = store.getEntity(entity2Id);
    console.log('Deleted entity (should be undefined):', deletedEntity);
    
    // Example 6: Wait for syncing to complete and verify remote state
    console.log('\nExample 6: Final remote state after syncing');
    setTimeout(async () => {
      // Check remote state
      const remoteEntity1 = await remoteSource.fetchEntity(entity1Id);
      const remoteTriples = await remoteSource.fetchTriples(entity1Id);
      const remoteRelations = await remoteSource.fetchRelations(entity1Id);
      
      console.log('Remote entity:', remoteEntity1);
      console.log('Remote triples:', remoteTriples);
      console.log('Remote relations:', remoteRelations);
      
      const isEntity2Deleted = await remoteSource.isDeleted(entity2Id);
      console.log('Is entity2 deleted on remote?', isEntity2Deleted);
    }, 1000);
  }, 100);
}

// Run the example
syncEngineExample().catch(console.error);
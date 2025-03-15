import { EntityId } from '../../../core/database/types';
import { Entity } from '../../../core/database/entities';
import { Triple } from '../../../core/database/Triple';
import { Relation } from '../../../core/database/Relation';
import { SyncWorkerMessage, SyncWorkerResponse } from './sync-engine';

/**
 * Web Worker for background entity synchronization
 * 
 * This worker handles data synchronization between the local store and remote source
 * in a separate thread to keep the UI responsive during data operations.
 * 
 * Usage:
 * 1. Create this file as sync-worker.ts
 * 2. Import it as a Worker in your application:
 *    const worker = new Worker(new URL('./sync-worker.ts', import.meta.url));
 * 3. Send messages to the worker:
 *    worker.postMessage({type: 'SYNC_ENTITY', payload: {id: 'entity1'}});
 * 4. Listen for responses:
 *    worker.addEventListener('message', (event) => {
 *      const response = event.data;
 *      // Handle response
 *    });
 */

// Local cache of entities, triples, and relations
const localCache = {
  entities: new Map<string, Entity>(),
  triples: new Map<string, Triple[]>(),
  relations: new Map<string, Relation[]>(),
  deletedEntities: new Set<string>()
};

// Configuration for the remote API endpoints
let config = {
  apiBaseUrl: '',
  authToken: ''
};

// Configure the worker
self.addEventListener('message', (event: MessageEvent<{type: 'CONFIG', payload: typeof config}>) => {
  if (event.data.type === 'CONFIG') {
    config = event.data.payload;
  }
});

// Main message handler
self.addEventListener('message', async (event: MessageEvent<SyncWorkerMessage>) => {
  const message = event.data;
  
  try {
    switch (message.type) {
      case 'SYNC_ENTITY':
        await syncEntity(message.payload.id as EntityId);
        break;
        
      case 'SYNC_MULTIPLE':
        await syncMultipleEntities(message.payload.ids.map(id => id as EntityId));
        break;
        
      case 'SYNC_PENDING_CHANGES':
        await syncPendingChanges();
        break;
        
      case 'SAVE_ENTITY':
        await saveEntity(message.payload.entity);
        break;
        
      case 'SAVE_TRIPLE':
        await saveTriple(message.payload.triple);
        break;
        
      case 'SAVE_RELATION':
        await saveRelation(message.payload.relation);
        break;
        
      case 'DELETE_ENTITY':
        await deleteEntity(message.payload.id as EntityId);
        break;
    }
  } catch (error) {
    console.error('Worker error:', error);
    // Send error response based on the message type
    switch (message.type) {
      case 'SYNC_ENTITY':
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: { 
            id: message.payload.id, 
            error: error instanceof Error ? error.message : String(error) 
          }
        } as SyncWorkerResponse);
        break;
        
      case 'SAVE_ENTITY':
      case 'SAVE_TRIPLE':
      case 'SAVE_RELATION':
        self.postMessage({
          type: 'SAVE_ERROR',
          payload: { 
            id: message.type === 'SAVE_ENTITY' 
              ? message.payload.entity.id 
              : message.type === 'SAVE_TRIPLE'
                ? message.payload.triple.entityId
                : message.payload.relation.fromEntity.id,
            error: error instanceof Error ? error.message : String(error) 
          }
        } as SyncWorkerResponse);
        break;
        
      case 'DELETE_ENTITY':
        self.postMessage({
          type: 'DELETE_ERROR',
          payload: { 
            id: message.payload.id, 
            error: error instanceof Error ? error.message : String(error) 
          }
        } as SyncWorkerResponse);
        break;
    }
  }
});

/**
 * Sync a single entity
 */
async function syncEntity(id: EntityId): Promise<void> {
  // Check if entity is deleted remotely
  const isDeleted = await fetchIsEntityDeleted(id);
  
  if (isDeleted) {
    // If deleted remotely, mark as deleted locally and notify
    self.postMessage({
      type: 'SYNC_SUCCESS',
      payload: { id: id as string, data: undefined }
    } as SyncWorkerResponse);
    return;
  }
  
  // Fetch entity data from remote
  const [entity, triples, relations] = await Promise.all([
    fetchEntity(id),
    fetchTriples(id),
    fetchRelations(id)
  ]);
  
  // Update local cache
  if (entity) {
    localCache.entities.set(id as string, entity);
  }
  
  if (triples) {
    localCache.triples.set(id as string, triples);
  }
  
  if (relations) {
    localCache.relations.set(id as string, relations);
  }
  
  // Send success response
  self.postMessage({
    type: 'SYNC_SUCCESS',
    payload: { 
      id: id as string,
      data: entity
    }
  } as SyncWorkerResponse);
  
  // Sync related entities in the background
  if (relations && relations.length > 0) {
    const relatedIds = new Set<string>();
    
    relations.forEach(relation => {
      relatedIds.add(relation.toEntity.id as string);
      relatedIds.add(relation.typeOf.id as string);
    });
    
    // Start syncing related entities in the background
    syncMultipleEntities(Array.from(relatedIds) as unknown as EntityId[]);
  }
}

/**
 * Sync multiple entities in parallel
 */
async function syncMultipleEntities(ids: EntityId[]): Promise<void> {
  // Create an array of sync promises
  const syncPromises = ids.map(id => 
    syncEntity(id)
      .catch(error => {
        console.error(`Error syncing entity ${id}:`, error);
        // Send individual error for this entity
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: { 
            id: id as string, 
            error: error instanceof Error ? error.message : String(error) 
          }
        } as SyncWorkerResponse);
      })
  );
  
  // Wait for all entities to sync
  await Promise.all(syncPromises);
  
  // Send completion notification
  self.postMessage({
    type: 'MULTIPLE_SYNC_COMPLETE',
    payload: { ids: ids.map(id => id as string) }
  } as SyncWorkerResponse);
}

/**
 * Sync any pending changes
 */
async function syncPendingChanges(): Promise<void> {
  // In a real implementation, this would:
  // 1. Get all pending changes from the main thread
  // 2. Apply them to the remote source
  // 3. Notify of success/failure
  
  // For this mock implementation, we'll just wait and send success
  await new Promise(resolve => setTimeout(resolve, 500));
  
  self.postMessage({
    type: 'SYNC_SUCCESS',
    payload: { id: 'pending_changes' }
  } as SyncWorkerResponse);
}

/**
 * Save an entity to the remote source
 */
async function saveEntity(entity: Entity): Promise<void> {
  // In a real implementation, this would send the entity to the API
  // For now, we'll simulate a network request with a delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Update the local cache
  localCache.entities.set(entity.id as string, entity);
  
  // Send success response
  self.postMessage({
    type: 'SAVE_SUCCESS',
    payload: { id: entity.id as string, dataType: 'entity' }
  } as SyncWorkerResponse);
}

/**
 * Save a triple to the remote source
 */
async function saveTriple(triple: Triple): Promise<void> {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Update the local cache
  const entityId = triple.entityId as unknown as EntityId;
  const existingTriples = localCache.triples.get(entityId as string) || [];
  
  // Check if this triple should replace an existing one
  const tripleKey = `${triple.entityId}-${triple.attributeId}-${triple.space}`;
  const updatedTriples = existingTriples
    .filter(t => `${t.entityId}-${t.attributeId}-${t.space}` !== tripleKey)
    .concat(triple.isDeleted ? [] : [triple]);
  
  localCache.triples.set(entityId as string, updatedTriples);
  
  // Send success response
  self.postMessage({
    type: 'SAVE_SUCCESS',
    payload: { id: entityId as string, dataType: 'triple' }
  } as SyncWorkerResponse);
}

/**
 * Save a relation to the remote source
 */
async function saveRelation(relation: Relation): Promise<void> {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Update the local cache
  const entityId = relation.fromEntity.id as string;
  const existingRelations = localCache.relations.get(entityId) || [];
  
  // Check if this relation should replace an existing one
  const updatedRelations = existingRelations
    .filter(r => r.id !== relation.id)
    .concat((relation as any).isDeleted ? [] : [relation]);
  
  localCache.relations.set(entityId, updatedRelations);
  
  // Send success response
  self.postMessage({
    type: 'SAVE_SUCCESS',
    payload: { id: entityId, dataType: 'relation' }
  } as SyncWorkerResponse);
}

/**
 * Delete an entity on the remote source
 */
async function deleteEntity(id: EntityId): Promise<void> {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Update the local cache
  localCache.entities.delete(id as string);
  localCache.triples.delete(id as string);
  localCache.relations.delete(id as string);
  localCache.deletedEntities.add(id as string);
  
  // Send success response
  self.postMessage({
    type: 'DELETE_SUCCESS',
    payload: { id: id as string }
  } as SyncWorkerResponse);
}

/**
 * Mock API functions
 */

async function fetchEntity(id: EntityId): Promise<Entity | null> {
  // Simulate network request
  await new Promise(resolve => setTimeout(resolve, 300));
  return localCache.entities.get(id as string) || null;
}

async function fetchTriples(entityId: EntityId): Promise<Triple[]> {
  // Simulate network request
  await new Promise(resolve => setTimeout(resolve, 300));
  return localCache.triples.get(entityId as string) || [];
}

async function fetchRelations(entityId: EntityId): Promise<Relation[]> {
  // Simulate network request
  await new Promise(resolve => setTimeout(resolve, 300));
  return localCache.relations.get(entityId as string) || [];
}

async function fetchIsEntityDeleted(id: EntityId): Promise<boolean> {
  // Simulate network request
  await new Promise(resolve => setTimeout(resolve, 300));
  return localCache.deletedEntities.has(id as string);
}

// Export an empty object to satisfy TypeScript module requirements
export {};
import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Relation, Triple } from '~/core/types';

/**
 * EventEmitter for state change notifications
 */
class EventEmitter {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  public on(event: string, callback: (...args: any[]) => void): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  public emit(event: string, ...args: any[]): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        callback(...args);
      });
    }
  }
}

/**
 * Optimistic Entity Store with sync capabilities
 */
export class EntityStore {
  // Core data storage
  private entities: Map<string, Entity> = new Map();
  private triples: Map<string, Triple[]> = new Map();
  private relations: Map<string, Relation[]> = new Map();
  private deletedEntities: Set<string> = new Set();

  // Pending optimistic updates
  private pendingTriples: Map<string, Map<string, Triple>> = new Map();
  private pendingRelations: Map<string, Map<string, Relation>> = new Map();
  pendingDeletes: Set<string> = new Set();

  // Sync status tracking
  private syncInProgress: Map<string, boolean> = new Map();

  // Event system
  private events: EventEmitter = new EventEmitter();

  // Event constants
  static ENTITY_UPDATED = 'entity:updated';
  static ENTITY_DELETED = 'entity:deleted';
  static TRIPLES_UPDATED = 'triples:updated';
  static RELATIONS_UPDATED = 'relations:updated';
  static SYNC_STARTED = 'sync:started';
  static SYNC_COMPLETED = 'sync:completed';
  static SYNC_ERROR = 'sync:error';

  /**
   * Get an entity by ID with full resolution of its relations
   */
  public getEntity(id: EntityId): Entity | undefined {
    // Check if the entity is deleted
    if (this.isDeleted(id)) return undefined;

    // Get the base entity
    const entity = this.entities.get(id);
    if (!entity) return undefined;

    // Get triples including any pending optimistic updates
    const triples = this.getResolvedTriples(id);

    // Get relations including any pending optimistic updates
    const relations = this.getResolvedRelations(id);

    // Return fully resolved entity
    return {
      ...entity,
      triples,
      relationsOut: relations,
    };
  }

  /**
   * Get multiple entities by ID with full resolution
   */
  public getEntities(ids: EntityId[]): Entity[] {
    return ids.map(id => this.getEntity(id)).filter((entity): entity is Entity => entity !== undefined);
  }

  /**
   * Get all entities (fully resolved)
   */
  public getAllEntities(): Entity[] {
    return Array.from(this.entities.keys())
      .filter(id => !this.isDeleted(id as EntityId))
      .map(id => this.getEntity(id as EntityId))
      .filter((entity): entity is Entity => entity !== undefined);
  }

  /**
   * Set or update an entity's base properties (without triples or relations)
   */
  public setEntityBase(entity: Omit<Entity, 'triples' | 'relationsOut'>): void {
    const baseEntity = { ...entity, triples: [], relationsOut: [] };
    this.entities.set(entity.id as string, baseEntity);
    this.events.emit(EntityStore.ENTITY_UPDATED, entity.id);
  }

  /**
   * Get triples for an entity (without pending changes)
   */
  private getBaseTriples(entityId: EntityId): Triple[] {
    return this.triples.get(entityId as string) || [];
  }

  /**
   * Get all triples for an entity including optimistic updates
   */
  public getResolvedTriples(entityId: EntityId): Triple[] {
    const baseTriples = this.getBaseTriples(entityId);
    const pendingTripleMap = this.pendingTriples.get(entityId as string);

    if (!pendingTripleMap || pendingTripleMap.size === 0) {
      return baseTriples;
    }

    // Create a map of base triples for easier merging
    const tripleMap = new Map<string, Triple>();

    // Function to generate a unique key for each triple
    const getTripleKey = (triple: Triple): string => `${triple.entityId}-${triple.attributeId}-${triple.space}`;

    // Add base triples to the map
    baseTriples.forEach(triple => {
      tripleMap.set(getTripleKey(triple), triple);
    });

    // Apply pending triple changes
    pendingTripleMap.forEach(pendingTriple => {
      const key = getTripleKey(pendingTriple);
      if (pendingTriple.isDeleted) {
        tripleMap.delete(key);
      } else {
        tripleMap.set(key, pendingTriple);
      }
    });

    return Array.from(tripleMap.values());
  }

  /**
   * Add or update a triple with optimistic updates
   */
  public setTriple(triple: Triple): void {
    const entityId = triple.entityId as EntityId;

    // Create a composite key for the triple
    const tripleKey = `${triple.entityId}-${triple.attributeId}-${triple.space}`;

    // Get or create the pending triples map for this entity
    if (!this.pendingTriples.has(entityId as string)) {
      this.pendingTriples.set(entityId as string, new Map());
    }

    // Add to pending changes
    this.pendingTriples.get(entityId as string)!.set(tripleKey, triple);

    // Emit update event
    this.events.emit(EntityStore.TRIPLES_UPDATED, entityId);
  }

  /**
   * Delete a triple with optimistic updates
   */
  public deleteTriple(triple: Triple): void {
    // Mark the triple as deleted in pending changes
    const entityId = triple.entityId as EntityId;
    const tripleKey = `${triple.entityId}-${triple.attributeId}-${triple.space}`;

    // Get or create the pending triples map for this entity
    if (!this.pendingTriples.has(entityId as string)) {
      this.pendingTriples.set(entityId as string, new Map());
    }

    // Add a deleted version to pending changes
    this.pendingTriples.get(entityId as string)!.set(tripleKey, {
      ...triple,
      isDeleted: true,
    });

    // Emit update event
    this.events.emit(EntityStore.TRIPLES_UPDATED, entityId);
  }

  /**
   * Get relations for an entity (without pending changes)
   */
  private getBaseRelations(entityId: EntityId): Relation[] {
    return this.relations.get(entityId as string) || [];
  }

  /**
   * Get all relations for an entity including optimistic updates
   */
  public getResolvedRelations(entityId: EntityId): Relation[] {
    const baseRelations = this.getBaseRelations(entityId);
    const pendingRelationMap = this.pendingRelations.get(entityId as string);

    if (!pendingRelationMap || pendingRelationMap.size === 0) {
      return baseRelations;
    }

    // Create a map of base relations for easier merging
    const relationMap = new Map<string, Relation>();

    // Add base relations to the map
    baseRelations.forEach(relation => {
      relationMap.set(relation.id as string, relation);
    });

    // Apply pending relation changes
    pendingRelationMap.forEach(pendingRelation => {
      if ((pendingRelation as any).isDeleted) {
        relationMap.delete(pendingRelation.id as string);
      } else {
        relationMap.set(pendingRelation.id as string, pendingRelation);
      }
    });

    return Array.from(relationMap.values());
  }

  /**
   * Add or update a relation with optimistic updates
   */
  public setRelation(relation: Relation): void {
    const entityId = relation.fromEntity.id;

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId as string)) {
      this.pendingRelations.set(entityId as string, new Map());
    }

    // Add to pending changes
    this.pendingRelations.get(entityId as string)!.set(relation.id as string, relation);

    // Emit update event
    this.events.emit(EntityStore.RELATIONS_UPDATED, entityId);
  }

  /**
   * Delete a relation with optimistic updates
   */
  public deleteRelation(relation: Relation): void {
    const entityId = relation.fromEntity.id;

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId as string)) {
      this.pendingRelations.set(entityId as string, new Map());
    }

    // Add a deleted version to pending changes
    this.pendingRelations.get(entityId as string)!.set(
      relation.id as string,
      {
        ...relation,
        isDeleted: true,
      } as Relation & { isDeleted: boolean }
    );

    // Emit update event
    this.events.emit(EntityStore.RELATIONS_UPDATED, entityId);
  }

  /**
   * Check if entity is marked as deleted (including pending deletes)
   */
  public isDeleted(id: EntityId): boolean {
    return this.deletedEntities.has(id as string) || this.pendingDeletes.has(id as string);
  }

  /**
   * Mark entity as deleted (optimistically)
   */
  public markAsDeleted(id: EntityId): void {
    // Add to pending deletes
    this.pendingDeletes.add(id as string);

    // Emit delete event
    this.events.emit(EntityStore.ENTITY_DELETED, id);
  }

  /**
   * Find all entities that reference the given entity in their relations
   */
  public findReferencingEntities(id: EntityId): EntityId[] {
    const referencingEntities: EntityId[] = [];

    // Check base relations
    this.relations.forEach((relationsArray, entityId) => {
      for (const relation of relationsArray) {
        if (relation.toEntity.id === id) {
          referencingEntities.push(entityId as unknown as EntityId);
          break;
        }
      }
    });

    // Check pending relations
    this.pendingRelations.forEach((pendingMap, entityId) => {
      pendingMap.forEach(relation => {
        if (relation.toEntity.id === id && !relation.isDeleted) {
          if (!referencingEntities.includes(entityId as unknown as EntityId)) {
            referencingEntities.push(entityId as unknown as EntityId);
          }
        }
      });
    });

    return referencingEntities;
  }

  /**
   * Subscribe to store events
   */
  public subscribe(event: string, callback: (...args: any[]) => void): () => void {
    return this.events.on(event, callback);
  }

  /**
   * Commit pending changes to base storage
   * This is typically called after successful sync with remote
   */
  public commitPendingChanges(entityId: EntityId): void {
    // Commit pending triples
    const pendingTripleMap = this.pendingTriples.get(entityId as string);
    if (pendingTripleMap && pendingTripleMap.size > 0) {
      const resolvedTriples = this.getResolvedTriples(entityId);
      this.triples.set(entityId as string, resolvedTriples);
      this.pendingTriples.delete(entityId as string);
    }

    // Commit pending relations
    const pendingRelationMap = this.pendingRelations.get(entityId as string);
    if (pendingRelationMap && pendingRelationMap.size > 0) {
      const resolvedRelations = this.getResolvedRelations(entityId);
      this.relations.set(entityId as string, resolvedRelations);
      this.pendingRelations.delete(entityId as string);
    }

    // Commit pending delete if applicable
    if (this.pendingDeletes.has(entityId as string)) {
      this.deletedEntities.add(entityId as string);
      this.pendingDeletes.delete(entityId as string);
      this.entities.delete(entityId as string);
      this.triples.delete(entityId as string);
      this.relations.delete(entityId as string);
    }
  }

  /**
   * Discard pending changes and revert to base storage
   */
  public discardPendingChanges(entityId: EntityId): void {
    this.pendingTriples.delete(entityId as string);
    this.pendingRelations.delete(entityId as string);
    this.pendingDeletes.delete(entityId as string);

    // Emit events to notify of the revert
    this.events.emit(EntityStore.ENTITY_UPDATED, entityId);
    this.events.emit(EntityStore.TRIPLES_UPDATED, entityId);
    this.events.emit(EntityStore.RELATIONS_UPDATED, entityId);
  }

  /**
   * Set the sync in progress flag for an entity
   */
  public setSyncInProgress(id: EntityId, inProgress: boolean): void {
    this.syncInProgress.set(id as string, inProgress);
  }

  /**
   * Check if sync is in progress for an entity
   */
  public isSyncInProgress(id: EntityId): boolean {
    return this.syncInProgress.get(id as string) || false;
  }

  /**
   * Update base storage directly (typically used by sync engine)
   */
  public updateBaseStorage(
    entityId: EntityId,
    entityData: Entity | null,
    triples: Triple[] | null,
    relations: Relation[] | null,
    isDeleted: boolean = false
  ): void {
    if (isDeleted) {
      this.deletedEntities.add(entityId as string);
      this.entities.delete(entityId as string);
      this.triples.delete(entityId as string);
      this.relations.delete(entityId as string);
    } else {
      if (entityData) {
        const baseEntity = {
          ...entityData,
          triples: [],
          relationsOut: [],
        };
        this.entities.set(entityId as string, baseEntity);
      }

      if (triples) {
        this.triples.set(entityId as string, triples);
      }

      if (relations) {
        this.relations.set(entityId as string, relations);
      }
    }
  }

  /**
   * Check if an entity has pending changes
   */
  public hasPendingChanges(id: EntityId): boolean {
    return (
      this.pendingDeletes.has(id as string) ||
      (this.pendingTriples.has(id as string) && this.pendingTriples.get(id as string)!.size > 0) ||
      (this.pendingRelations.has(id as string) && this.pendingRelations.get(id as string)!.size > 0)
    );
  }

  /**
   * Get all entity IDs with pending changes
   */
  public getEntitiesWithPendingChanges(): EntityId[] {
    const entityIds = new Set<string>();

    // Entities with pending triples
    this.pendingTriples.forEach((_, id) => {
      entityIds.add(id);
    });

    // Entities with pending relations
    this.pendingRelations.forEach((_, id) => {
      entityIds.add(id);
    });

    // Entities pending deletion
    this.pendingDeletes.forEach(id => {
      entityIds.add(id);
    });

    return Array.from(entityIds) as unknown as EntityId[];
  }
}

/**
 * Interface for remote data operations
 */
interface RemoteDataSource {
  fetchEntity(id: EntityId): Promise<Entity | null>;
  fetchTriples(entityId: EntityId): Promise<Triple[]>;
  fetchRelations(entityId: EntityId): Promise<Relation[]>;
  isDeleted(id: EntityId): Promise<boolean>;

  // Optional write operations
  saveEntity?(entity: Entity): Promise<void>;
  saveTriples?(entityId: EntityId, triples: Triple[]): Promise<void>;
  saveRelations?(entityId: EntityId, relations: Relation[]): Promise<void>;
  deleteEntity?(id: EntityId): Promise<void>;
}

/**
 * Mock implementation of remote data source
 */
export class MockRemoteDataSource implements RemoteDataSource {
  private entities: Map<string, Entity> = new Map();
  private entityTriples: Map<string, Triple[]> = new Map();
  private entityRelations: Map<string, Relation[]> = new Map();
  private deletedEntities: Set<string> = new Set();

  constructor(mockData?: {
    entities?: Entity[];
    triples?: Record<string, Triple[]>;
    relations?: Record<string, Relation[]>;
    deleted?: string[];
  }) {
    if (mockData) {
      if (mockData.entities) {
        mockData.entities.forEach(entity => {
          this.entities.set(entity.id as string, entity);
        });
      }

      if (mockData.triples) {
        Object.entries(mockData.triples).forEach(([entityId, triples]) => {
          this.entityTriples.set(entityId, triples);
        });
      }

      if (mockData.relations) {
        Object.entries(mockData.relations).forEach(([entityId, relations]) => {
          this.entityRelations.set(entityId, relations);
        });
      }

      if (mockData.deleted) {
        mockData.deleted.forEach(id => {
          this.deletedEntities.add(id);
        });
      }
    }
  }

  // Simulate network delay
  private async delay(ms: number = 300): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchEntity(id: EntityId): Promise<Entity | null> {
    await this.delay();
    return this.entities.get(id as string) || null;
  }

  async fetchTriples(entityId: EntityId): Promise<Triple[]> {
    await this.delay();
    return this.entityTriples.get(entityId as string) || [];
  }

  async fetchRelations(entityId: EntityId): Promise<Relation[]> {
    await this.delay();
    return this.entityRelations.get(entityId as string) || [];
  }

  async isDeleted(id: EntityId): Promise<boolean> {
    await this.delay();
    return this.deletedEntities.has(id as string);
  }

  // Write operations for testing
  async saveEntity(entity: Entity): Promise<void> {
    await this.delay();
    this.entities.set(entity.id as string, entity);
  }

  async saveTriples(entityId: EntityId, triples: Triple[]): Promise<void> {
    await this.delay();
    this.entityTriples.set(entityId as string, triples);
  }

  async saveRelations(entityId: EntityId, relations: Relation[]): Promise<void> {
    await this.delay();
    this.entityRelations.set(entityId as string, relations);
  }

  async deleteEntity(id: EntityId): Promise<void> {
    await this.delay();
    this.deletedEntities.add(id as string);
    this.entities.delete(id as string);
    this.entityTriples.delete(id as string);
    this.entityRelations.delete(id as string);
  }
}

/**
 * Message types for the Web Worker
 */
export type SyncWorkerMessage =
  | { type: 'SYNC_ENTITY'; payload: { id: string } }
  | { type: 'SYNC_MULTIPLE'; payload: { ids: string[] } }
  | { type: 'SYNC_PENDING_CHANGES'; payload?: any }
  | { type: 'SAVE_ENTITY'; payload: { entity: Entity } }
  | { type: 'SAVE_TRIPLE'; payload: { triple: Triple } }
  | { type: 'SAVE_RELATION'; payload: { relation: Relation } }
  | { type: 'DELETE_ENTITY'; payload: { id: string } };

/**
 * Response types from the Web Worker
 */
export type SyncWorkerResponse =
  | { type: 'SYNC_SUCCESS'; payload: { id: string; data?: Entity } }
  | { type: 'SYNC_ERROR'; payload: { id: string; error: string } }
  | { type: 'MULTIPLE_SYNC_COMPLETE'; payload: { ids: string[] } }
  | { type: 'SAVE_SUCCESS'; payload: { id: string; dataType: 'entity' | 'triple' | 'relation' } }
  | { type: 'SAVE_ERROR'; payload: { id: string; error: string } }
  | { type: 'DELETE_SUCCESS'; payload: { id: string } }
  | { type: 'DELETE_ERROR'; payload: { id: string; error: string } };

/**
 * Sync Engine that handles synchronization between local and remote data
 */
export class SyncEngine {
  public store: EntityStore;
  private remote: RemoteDataSource;
  private syncQueue: Set<string> = new Set();
  private isSyncing: boolean = false;
  private events: EventEmitter = new EventEmitter();
  private worker: Worker | null = null;

  // Event constants
  static SYNC_STARTED = 'sync:started';
  static SYNC_COMPLETED = 'sync:completed';
  static SYNC_FAILED = 'sync:failed';
  static ENTITY_SYNCED = 'entity:synced';

  constructor(store: EntityStore, remote: RemoteDataSource) {
    this.store = store;
    this.remote = remote;

    // Initialize web worker if supported
    this.initWorker();

    // Watch for changes in referencing entities when an entity is updated
    this.store.subscribe(EntityStore.ENTITY_UPDATED, (entityId: EntityId) => {
      this.updateRelationReferences(entityId);
    });
  }

  /**
   * Initialize the web worker for background syncing if supported
   */
  private initWorker(): void {
    // Check if web workers are supported
    if (typeof Worker !== 'undefined') {
      try {
        // In a real implementation, this would be a reference to an actual worker file
        // this.worker = new Worker('/sync-worker.js');

        // Listen for messages from the worker
        // this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));

        console.log('Web worker initialized for background sync');
      } catch (error) {
        console.warn('Failed to initialize sync worker:', error);
      }
    } else {
      console.warn('Web Workers not supported in this environment');
    }
  }

  /**
   * Handle messages from the web worker
   */
  private handleWorkerMessage(event: MessageEvent<SyncWorkerResponse>): void {
    const message = event.data;

    switch (message.type) {
      case 'SYNC_SUCCESS':
        this.store.setSyncInProgress(message.payload.id as EntityId, false);
        this.events.emit(SyncEngine.ENTITY_SYNCED, message.payload.id);
        break;

      case 'SYNC_ERROR':
        this.store.setSyncInProgress(message.payload.id as EntityId, false);
        this.events.emit(SyncEngine.SYNC_FAILED, message.payload.id, message.payload.error);
        break;

      case 'SAVE_SUCCESS':
        // Commit the pending changes for this entity
        this.store.commitPendingChanges(message.payload.id as EntityId);
        break;

      case 'SAVE_ERROR':
        console.error(`Error saving ${message.payload.id}:`, message.payload.error);
        // Could potentially roll back changes here
        break;

      case 'DELETE_SUCCESS':
        // Confirm the deletion
        this.store.commitPendingChanges(message.payload.id as EntityId);
        break;

      case 'DELETE_ERROR':
        console.error(`Error deleting ${message.payload.id}:`, message.payload.error);
        break;
    }
  }

  /**
   * Queue entity for synchronization (optimistic updates are preserved)
   */
  public queueEntitySync(id: EntityId): void {
    // If we have a worker, delegate to it
    if (this.worker) {
      this.store.setSyncInProgress(id, true);
      const message: SyncWorkerMessage = {
        type: 'SYNC_ENTITY',
        payload: { id: id as string },
      };
      this.worker.postMessage(message);
      return;
    }

    // Otherwise add to the queue for processing
    this.syncQueue.add(id as string);
    this.processSyncQueue();
  }

  /**
   * Process the sync queue (only used when not using web worker)
   */
  private async processSyncQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.size === 0) return;

    this.isSyncing = true;
    this.events.emit(SyncEngine.SYNC_STARTED);

    try {
      const syncPromises: Promise<void>[] = [];

      // Process all items in the queue
      for (const id of this.syncQueue) {
        const entityId = id as unknown as EntityId;
        this.store.setSyncInProgress(entityId, true);

        syncPromises.push(
          this.syncEntity(entityId)
            .then(() => {
              this.store.setSyncInProgress(entityId, false);
              this.events.emit(SyncEngine.ENTITY_SYNCED, id);
            })
            .catch(error => {
              this.store.setSyncInProgress(entityId, false);
              console.error(`Error syncing entity ${id}:`, error);
              this.events.emit(SyncEngine.SYNC_FAILED, id, error);
            })
        );

        this.syncQueue.delete(id);
      }

      await Promise.all(syncPromises);
      this.events.emit(SyncEngine.SYNC_COMPLETED);
    } finally {
      this.isSyncing = false;

      // If new items were added to the queue during processing, process them
      if (this.syncQueue.size > 0) {
        this.processSyncQueue();
      }
    }
  }

  /**
   * Synchronize a single entity (merge remote data with local)
   */
  private async syncEntity(id: EntityId): Promise<void> {
    // Skip sync for entities that are pending deletion
    if (this.store.pendingDeletes?.has?.(id as string)) {
      return;
    }

    try {
      // Check if entity is deleted remotely
      const isRemotelyDeleted = await this.remote.isDeleted(id);

      if (isRemotelyDeleted) {
        // If deleted remotely and we have local changes, keep local
        if (this.store.hasPendingChanges(id)) {
          return;
        }

        // Otherwise mark as deleted locally
        this.store.updateBaseStorage(id, null, null, null, true);
        return;
      }

      // Fetch remote data
      const [remoteEntity, remoteTriples, remoteRelations] = await Promise.all([
        this.remote.fetchEntity(id),
        this.remote.fetchTriples(id),
        this.remote.fetchRelations(id),
      ]);

      // If nothing exists remotely, and we don't have local data, nothing to sync
      if (!remoteEntity && !this.store.getEntity(id)) {
        return;
      }

      // Update base storage with remote data
      this.store.updateBaseStorage(id, remoteEntity, remoteTriples, remoteRelations, false);

      // Sync referenced entities in relations
      await this.syncReferencedEntities(remoteRelations || []);
    } catch (error) {
      console.error(`Error syncing entity ${id}:`, error);
      throw error;
    }
  }

  /**
   * Synchronize entities referenced in relations
   */
  private async syncReferencedEntities(relations: Relation[]): Promise<void> {
    // Collect unique related entity IDs
    const relatedEntityIds = new Set<string>();

    relations.forEach(relation => {
      // Target entity of the relation
      relatedEntityIds.add(relation.toEntity.id as string);
      // Type of the relation
      relatedEntityIds.add(relation.typeOf.id as string);
    });

    // Queue each related entity for syncing
    relatedEntityIds.forEach(id => {
      this.queueEntitySync(id as unknown as EntityId);
    });
  }

  /**
   * Update relations when a referenced entity changes
   */
  private async updateRelationReferences(id: EntityId): Promise<void> {
    // Find all entities that reference this entity
    const referencingEntityIds = this.store.findReferencingEntities(id);
    if (referencingEntityIds.length === 0) return;

    // Get the updated entity
    const updatedEntity = this.store.getEntity(id);
    if (!updatedEntity) return;

    // For each referencing entity, update the relation
    for (const parentId of referencingEntityIds) {
      const relations = this.store.getResolvedRelations(parentId);
      let hasChanges = false;

      // Update relations that reference the changed entity
      const updatedRelations = relations.map(relation => {
        if (relation.toEntity.id === id) {
          hasChanges = true;
          // Update the toEntity reference with latest entity data
          return {
            ...relation,
            toEntity: {
              ...relation.toEntity,
              name: updatedEntity.name,
              // Update other fields as needed
            },
          };
        }
        return relation;
      });

      // Only update if there were changes
      if (hasChanges) {
        // Update each relation individually to maintain proper optimistic updates
        updatedRelations.forEach(relation => {
          if (relation.toEntity.id === id) {
            this.store.setRelation(relation);
          }
        });
      }
    }
  }

  /**
   * Create or update an entity (optimistically)
   */
  public createOrUpdateEntity(entity: Entity): void {
    // Apply optimistic update
    this.store.setEntityBase(entity);

    // Set entity triples
    if (entity.triples && entity.triples.length > 0) {
      entity.triples.forEach(triple => {
        this.store.setTriple(triple);
      });
    }

    // Set entity relations
    if (entity.relationsOut && entity.relationsOut.length > 0) {
      entity.relationsOut.forEach(relation => {
        this.store.setRelation(relation);
      });
    }

    // Queue background sync
    if (this.worker) {
      const message: SyncWorkerMessage = {
        type: 'SAVE_ENTITY',
        payload: { entity },
      };
      this.worker.postMessage(message);
    } else if (this.remote.saveEntity) {
      // If no worker but we have save capability, do it in the background
      this.remote
        .saveEntity(entity)
        .then(() => {
          this.store.commitPendingChanges(entity.id);
        })
        .catch(error => {
          console.error(`Error saving entity ${entity.id}:`, error);
        });
    }
  }

  /**
   * Add or update a triple (optimistically)
   */
  public setTriple(triple: Triple): void {
    // Apply optimistic update
    this.store.setTriple(triple);

    // Queue background sync
    if (this.worker) {
      const message: SyncWorkerMessage = {
        type: 'SAVE_TRIPLE',
        payload: { triple },
      };
      this.worker.postMessage(message);
    } else if (this.remote.saveTriples) {
      const entityId = triple.entityId as EntityId;
      const allTriples = this.store.getResolvedTriples(entityId);

      this.remote
        .saveTriples(entityId, allTriples)
        .then(() => {
          this.store.commitPendingChanges(entityId);
        })
        .catch(error => {
          console.error(`Error saving triple for ${entityId}:`, error);
        });
    }
  }

  /**
   * Add or update a relation (optimistically)
   */
  public setRelation(relation: Relation): void {
    // Apply optimistic update
    this.store.setRelation(relation);

    // Queue background sync
    if (this.worker) {
      const message: SyncWorkerMessage = {
        type: 'SAVE_RELATION',
        payload: { relation },
      };
      // this.worker.postMessage(message);
    } else if (this.remote.saveRelations) {
      const entityId = relation.fromEntity.id;
      const allRelations = this.store.getResolvedRelations(entityId);

      this.remote
        .saveRelations(entityId, allRelations)
        .then(() => {
          this.store.commitPendingChanges(entityId);
        })
        .catch(error => {
          console.error(`Error saving relation for ${entityId}:`, error);
        });
    }
  }

  /**
   * Delete a triple (optimistically)
   */
  public deleteTriple(triple: Triple): void {
    // Apply optimistic update
    this.store.deleteTriple(triple);

    // Handle remote sync the same as setting a triple
    this.setTriple({
      ...triple,
      isDeleted: true,
    });
  }

  /**
   * Delete a relation (optimistically)
   */
  public deleteRelation(relation: Relation): void {
    // Apply optimistic update
    this.store.deleteRelation(relation);

    // Handle remote sync the same as setting a relation
    this.setRelation({
      ...relation,
      isDeleted: true,
    } as Relation & { isDeleted: boolean });
  }

  /**
   * Delete an entity (optimistically)
   */
  public deleteEntity(id: EntityId): void {
    // Apply optimistic update
    this.store.markAsDeleted(id);

    // Queue background sync
    if (this.worker) {
      const message: SyncWorkerMessage = {
        type: 'DELETE_ENTITY',
        payload: { id: id as string },
      };
      // this.worker.postMessage(message);
    } else if (this.remote.deleteEntity) {
      this.remote
        .deleteEntity(id)
        .then(() => {
          this.store.commitPendingChanges(id);
        })
        .catch(error => {
          console.error(`Error deleting entity ${id}:`, error);
        });
    }
  }

  /**
   * Sync all entities with pending changes
   */
  public syncPendingChanges(): void {
    const entitiesWithChanges = this.store.getEntitiesWithPendingChanges();

    if (entitiesWithChanges.length === 0) return;

    if (this.worker) {
      const message: SyncWorkerMessage = {
        type: 'SYNC_PENDING_CHANGES',
      };
      // this.worker.postMessage(message);
    } else {
      // Queue each entity for syncing
      entitiesWithChanges.forEach(entityId => {
        this.queueEntitySync(entityId);
      });
    }
  }

  /**
   * Subscribe to sync events
   */
  public subscribe(event: string, callback: (...args: any[]) => void): () => void {
    return this.events.on(event, callback);
  }
}

/**
 * Web Worker implementation
 * This would be in a separate file (sync-worker.js)
 */
/*
self.addEventListener('message', async (event) => {
  const message = event.data as SyncWorkerMessage;
  
  switch (message.type) {
    case 'SYNC_ENTITY':
      try {
        // Logic to sync entity
        self.postMessage({
          type: 'SYNC_SUCCESS',
          payload: { id: message.payload.id }
        });
      } catch (error) {
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: { id: message.payload.id, error: error.message }
        });
      }
      break;
      
    case 'SAVE_ENTITY':
      try {
        // Logic to save entity
        self.postMessage({
          type: 'SAVE_SUCCESS',
          payload: { id: message.payload.entity.id, dataType: 'entity' }
        });
      } catch (error) {
        self.postMessage({
          type: 'SAVE_ERROR',
          payload: { id: message.payload.entity.id, error: error.message }
        });
      }
      break;
      
    // Handle other message types
  }
});
*/

/**
 * Factory function to create a sync engine with store
 */
export function createSyncEngine(mockData?: {
  entities?: Entity[];
  triples?: Record<string, Triple[]>;
  relations?: Record<string, Relation[]>;
  deleted?: string[];
}): {
  store: EntityStore;
  syncEngine: SyncEngine;
  remoteSource: MockRemoteDataSource;
} {
  // Create the local entity store
  const store = new EntityStore();

  // Create the mock remote data source
  const remoteSource = new MockRemoteDataSource(mockData);

  // Create the sync engine
  const syncEngine = new SyncEngine(store, remoteSource);

  return {
    store,
    syncEngine,
    remoteSource,
  };
}

/**
 * Usage example:
 *
 * const { store, syncEngine } = createSyncEngine();
 *
 * // Create/update an entity optimistically
 * syncEngine.createOrUpdateEntity({
 *   id: "entity1" as EntityId,
 *   name: "Example Entity",
 *   // other entity fields
 * });
 *
 * // Read entity (fully resolved with relations)
 * const entity = store.getEntity("entity1" as EntityId);
 *
 * // Add a triple (optimistically)
 * syncEngine.setTriple({
 *   entityId: "entity1",
 *   attributeId: "attr1",
 *   // other triple fields
 * });
 *
 * // Add a relation (optimistically)
 * syncEngine.setRelation({
 *   fromEntity: { id: "entity1" as EntityId },
 *   toEntity: { id: "entity2" as EntityId },
 *   // other relation fields
 * });
 *
 * // Delete an entity (optimistically)
 * syncEngine.deleteEntity("entity1" as EntityId);
 */

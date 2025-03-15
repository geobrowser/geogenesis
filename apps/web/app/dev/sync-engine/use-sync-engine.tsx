import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Relation, Triple } from '~/core/types';

import { EntityStore, MockRemoteDataSource, SyncEngine, createSyncEngine } from './sync-engine';

// Context for sync engine
interface SyncEngineContextType {
  store: EntityStore;
  syncEngine: SyncEngine;
  remoteSource: MockRemoteDataSource;
  loading: boolean;
}

const SyncEngineContext = createContext<SyncEngineContextType | null>(null);

// Props for provider
interface SyncEngineProviderProps {
  children: ReactNode;
  initialData?: {
    entities?: Entity[];
    triples?: Record<string, Triple[]>;
    relations?: Record<string, Relation[]>;
    deleted?: string[];
  };
}

/**
 * Provider component that initializes the sync engine and makes it available to all children
 */
export function SyncEngineProvider({ children, initialData }: SyncEngineProviderProps) {
  const [loading, setLoading] = useState(true);
  const [syncEngineState, setSyncEngineState] = useState<Omit<SyncEngineContextType, 'loading'> | null>(null);

  // Initialize the sync engine once on mount
  useEffect(() => {
    const instance = createSyncEngine(initialData);
    setSyncEngineState(instance);
    setLoading(false);
  }, []);

  // Only render children when sync engine is ready
  if (loading || !syncEngineState) {
    return <div>Loading sync engine...</div>;
  }

  return <SyncEngineContext.Provider value={{ ...syncEngineState, loading }}>{children}</SyncEngineContext.Provider>;
}

/**
 * Hook to access the sync engine and store
 */
export function useSyncEngine() {
  const context = useContext(SyncEngineContext);
  if (!context) {
    throw new Error('useSyncEngine must be used within a SyncEngineProvider');
  }
  return context;
}

/**
 * Hook to access and subscribe to a specific entity
 */
export function useEntity(id: EntityId | null) {
  const { store, syncEngine } = useSyncEngine();
  const [entity, setEntity] = useState<Entity | undefined>(id ? store.getEntity(id) : undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Effect to handle entity subscription and initial fetch
  useEffect(() => {
    if (!id) {
      setEntity(undefined);
      return undefined;
    }

    // Get initial entity state
    setEntity(store.getEntity(id));
    setIsLoading(true);

    // Sync the entity (will trigger events if updates are needed)
    syncEngine.queueEntitySync(id);

    // Subscribe to store events for this entity
    const unsubscribeUpdates = store.subscribe(EntityStore.ENTITY_UPDATED, (entityId: EntityId) => {
      if (entityId === id) {
        setEntity(store.getEntity(id));
      }
    });

    const unsubscribeTriples = store.subscribe(EntityStore.TRIPLES_UPDATED, (entityId: EntityId) => {
      if (entityId === id) {
        setEntity(store.getEntity(id));
      }
    });

    const unsubscribeRelations = store.subscribe(EntityStore.RELATIONS_UPDATED, (entityId: EntityId) => {
      if (entityId === id) {
        setEntity(store.getEntity(id));
      }
    });

    const unsubscribeDeleted = store.subscribe(EntityStore.ENTITY_DELETED, (entityId: EntityId) => {
      if (entityId === id) {
        setEntity(undefined);
      }
    });

    // Subscribe to sync events
    const unsubscribeSynced = syncEngine.subscribe(SyncEngine.ENTITY_SYNCED, (entityId: string) => {
      if (entityId === id) {
        setIsLoading(false);
      }
    });

    const unsubscribeSyncFailed = syncEngine.subscribe(SyncEngine.SYNC_FAILED, (entityId: string, err: Error) => {
      if (entityId === id) {
        setIsLoading(false);
        setError(err);
      }
    });

    // Cleanup subscriptions on unmount or when ID changes
    return () => {
      unsubscribeUpdates();
      unsubscribeTriples();
      unsubscribeRelations();
      unsubscribeDeleted();
      unsubscribeSynced();
      unsubscribeSyncFailed();
    };
  }, [id, store, syncEngine]);

  // Operations for this entity
  const operations = useMemo(() => {
    if (!id) return null;

    return {
      // Update entity base data
      updateEntity: (updatedEntity: Partial<Omit<Entity, 'triples' | 'relationsOut'>>) => {
        if (!entity) return;
        syncEngine.createOrUpdateEntity({
          ...entity,
          ...updatedEntity,
          triples: entity.triples,
          relationsOut: entity.relationsOut,
        });
      },

      // Update a triple
      setTriple: (triple: Triple) => {
        syncEngine.setTriple(triple);
      },

      // Delete a triple
      deleteTriple: (triple: Triple) => {
        syncEngine.deleteTriple(triple);
      },

      // Add a relation
      setRelation: (relation: Relation) => {
        syncEngine.setRelation(relation);
      },

      // Delete a relation
      deleteRelation: (relation: Relation) => {
        syncEngine.deleteRelation(relation);
      },

      // Delete the entity
      deleteEntity: () => {
        syncEngine.deleteEntity(id);
      },

      // Refresh the entity from remote
      refresh: () => {
        setIsLoading(true);
        syncEngine.queueEntitySync(id);
      },
    };
  }, [id, entity, syncEngine]);

  return {
    entity,
    isLoading,
    error,
    operations,
  };
}

/**
 * Hook to access and subscribe to multiple entities at once
 */
export function useEntities(ids: EntityId[]) {
  const { store, syncEngine } = useSyncEngine();
  const [entities, setEntities] = useState<Record<string, Entity | undefined>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, Error | null>>({});

  // Update entities whenever the list of IDs changes
  useEffect(() => {
    // Initialize state for all IDs
    const initialEntities: Record<string, Entity | undefined> = {};
    const initialLoading: Record<string, boolean> = {};
    const initialErrors: Record<string, Error | null> = {};

    ids.forEach(id => {
      initialEntities[id as string] = store.getEntity(id);
      initialLoading[id as string] = true;
      initialErrors[id as string] = null;
    });

    setEntities(initialEntities);
    setLoading(initialLoading);
    setErrors(initialErrors);

    // Queue sync for all entities
    ids.forEach(id => {
      syncEngine.queueEntitySync(id);
    });

    // Subscribe to store events for all entities
    const handleEntityUpdate = (entityId: EntityId) => {
      if (ids.includes(entityId)) {
        setEntities(prev => ({
          ...prev,
          [entityId as string]: store.getEntity(entityId),
        }));
      }
    };

    const handleEntityDeleted = (entityId: EntityId) => {
      if (ids.includes(entityId)) {
        setEntities(prev => ({
          ...prev,
          [entityId as string]: undefined,
        }));
      }
    };

    const handleEntitySynced = (entityId: string) => {
      if (ids.some(id => (id as string) === entityId)) {
        setLoading(prev => ({
          ...prev,
          [entityId]: false,
        }));
      }
    };

    const handleSyncFailed = (entityId: string, error: Error) => {
      if (ids.some(id => (id as string) === entityId)) {
        setLoading(prev => ({
          ...prev,
          [entityId]: false,
        }));
        setErrors(prev => ({
          ...prev,
          [entityId]: error,
        }));
      }
    };

    // Subscribe to events
    const unsubscribeUpdates = store.subscribe(EntityStore.ENTITY_UPDATED, handleEntityUpdate);
    const unsubscribeTriples = store.subscribe(EntityStore.TRIPLES_UPDATED, handleEntityUpdate);
    const unsubscribeRelations = store.subscribe(EntityStore.RELATIONS_UPDATED, handleEntityUpdate);
    const unsubscribeDeleted = store.subscribe(EntityStore.ENTITY_DELETED, handleEntityDeleted);
    const unsubscribeSynced = syncEngine.subscribe(SyncEngine.ENTITY_SYNCED, handleEntitySynced);
    const unsubscribeSyncFailed = syncEngine.subscribe(SyncEngine.SYNC_FAILED, handleSyncFailed);

    // Cleanup subscriptions
    return () => {
      unsubscribeUpdates();
      unsubscribeTriples();
      unsubscribeRelations();
      unsubscribeDeleted();
      unsubscribeSynced();
      unsubscribeSyncFailed();
    };
  }, [ids, store, syncEngine]);

  // Entity operations by ID
  const operations = useMemo(() => {
    const ops: Record<string, ReturnType<typeof useEntity>['operations']> = {};

    ids.forEach(id => {
      const entity = entities[id as string];

      ops[id as string] = {
        updateEntity: (updatedEntity: Partial<Omit<Entity, 'triples' | 'relationsOut'>>) => {
          if (!entity) return;
          syncEngine.createOrUpdateEntity({
            ...entity,
            ...updatedEntity,
            triples: entity.triples,
            relationsOut: entity.relationsOut,
          });
        },

        setTriple: (triple: Triple) => {
          syncEngine.setTriple(triple);
        },

        deleteTriple: (triple: Triple) => {
          syncEngine.deleteTriple(triple);
        },

        setRelation: (relation: Relation) => {
          syncEngine.setRelation(relation);
        },

        deleteRelation: (relation: Relation) => {
          syncEngine.deleteRelation(relation);
        },

        deleteEntity: () => {
          syncEngine.deleteEntity(id);
        },

        refresh: () => {
          setLoading(prev => ({
            ...prev,
            [id as string]: true,
          }));
          syncEngine.queueEntitySync(id);
        },
      };
    });

    return ops;
  }, [ids, entities, syncEngine]);

  return {
    entities,
    loading,
    errors,
    operations,

    // Refresh all entities
    refreshAll: () => {
      const newLoading = { ...loading };
      ids.forEach(id => {
        newLoading[id as string] = true;
        syncEngine.queueEntitySync(id);
      });
      setLoading(newLoading);
    },
  };
}

/**
 * Hook to create a new entity with the sync engine
 */
export function useCreateEntity() {
  const { syncEngine } = useSyncEngine();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createEntity = async (entity: Omit<Entity, 'id'> & { id?: EntityId }) => {
    try {
      setIsCreating(true);
      setError(null);

      // Create a new entity with a generated ID if one isn't provided
      const entityId = entity.id || (`entity_${Date.now()}` as unknown as EntityId);
      const newEntity: Entity = {
        ...entity,
        id: entityId,
      };

      // Apply optimistic update
      syncEngine.createOrUpdateEntity(newEntity);

      setIsCreating(false);
      return entityId;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsCreating(false);
      throw err;
    }
  };

  return {
    createEntity,
    isCreating,
    error,
  };
}

/**
 * Example component using the sync engine hooks
 */
export function EntityViewer({ entityId }: { entityId: EntityId }) {
  const { entity, isLoading, error, operations } = useEntity(entityId);

  if (isLoading) {
    return <div>Loading entity...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!entity) {
    return <div>Entity not found</div>;
  }

  return (
    <div>
      <h2>{entity.name || 'Unnamed Entity'}</h2>
      <p>{entity.description || 'No description'}</p>

      <h3>Triples</h3>
      <ul>
        {entity.triples.map((triple, index) => (
          <li key={index}>
            {triple.attributeName}: {triple.value.value}
            <button onClick={() => operations?.deleteTriple(triple)}>Delete</button>
          </li>
        ))}
      </ul>

      <h3>Relations</h3>
      <ul>
        {entity.relationsOut.map((relation, index) => (
          <li key={index}>
            {relation.typeOf.name} → {relation.toEntity.name}
            <button onClick={() => operations?.deleteRelation(relation)}>Delete</button>
          </li>
        ))}
      </ul>

      <button onClick={() => operations?.refresh()}>Refresh</button>
      <button onClick={() => operations?.deleteEntity()}>Delete Entity</button>
    </div>
  );
}

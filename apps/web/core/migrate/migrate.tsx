import { batch } from '@legendapp/state';
import { QueryClient } from '@tanstack/query-core';
import { useQueryClient } from '@tanstack/react-query';

import React from 'react';

import { Environment } from '../environment';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { Merged } from '../merged';
import { Services } from '../services';
import { ActionsStore } from '../state/actions-store';
import { TripleValueType } from '../types';

type MigrateAction =
  | {
      type: 'DELETE_ENTITY';
      payload: {
        entityId: string;
      };
    }
  | {
      type: 'CHANGE_VALUE_TYPE';
      payload: {
        attributeId: string;
        oldValueType: TripleValueType;
        newValueType: TripleValueType;
      };
    };

interface MigrateHubConfig {
  actionsApi: {
    create: ActionsStore['create'];
    update: ActionsStore['update'];
    remove: ActionsStore['remove'];
  };
  queryClient: QueryClient;
  merged: Merged;
  appConfig: Environment.AppConfig;
}

interface IMigrateHub {
  migrate: (action: MigrateAction) => Promise<void>;
}

async function migrate(action: MigrateAction, config: MigrateHubConfig) {
  switch (action.type) {
    case 'DELETE_ENTITY': {
      const { entityId } = action.payload;

      // @TODO: For now we only delete triples one-level deep, eventually we might
      // want cascading deletes when an entity is deleted. See the commented out
      // Graph class below for more details on the algo.
      //
      // We also should batch fetching paginated data.
      //
      // Should this be an effect?
      const triplesReferencingEntity = await config.queryClient.fetchQuery({
        queryKey: ['migrate-triples-referencing-entity', entityId],
        queryFn: () =>
          config.merged.fetchTriples({
            query: '',
            first: 1000,
            skip: 0,
            endpoint: config.appConfig.subgraph,
            filter: [
              {
                field: 'linked-to',
                value: entityId,
              },
            ],
          }),
      });

      batch(() => triplesReferencingEntity.map(t => config.actionsApi.remove(t)));
      break;
    }
    case 'CHANGE_VALUE_TYPE':
      throw new Error('CHANGE_VALUE_TYPE migration not yet supported.');
  }
}

function migrateHub(config: MigrateHubConfig): IMigrateHub {
  return {
    migrate: async (action: MigrateAction) => await migrate(action, config),
  };
}

// @TODO: For now we don't need a library for handling traversing the graph.
// Eventually we will for more complex garbage-collecting of data in Geo, like
// cascading deletes after deleting an entity.
// class Graph {
//   adjacencyList: Map<number, number[]>;
//   visited: Set<number>;
//   private queryClient: MigrateHubConfig['queryClient'];
//   private merged: MigrateHubConfig['merged'];
//   private appConfig: MigrateHubConfig['appConfig'];

//   constructor(config: OmitStrict<MigrateHubConfig, 'actionsApi'>) {
//     this.adjacencyList = new Map();
//     this.visited = new Set();
//     this.queryClient = config.queryClient;
//     this.merged = config.merged;
//     this.appConfig = config.appConfig;
//   }

/**
 * We need to recursively delete all downstream triples (edges) for any entity (node)
 * that as a result of being deleting the original node.
 *
 * Deleting an entity should delete all triples (edges) that reference this entity.
 * If the delete triples are the last triple in the entity (node), we should also
 * delete references to that entity.
 */
// async generateDownstreamReferencesToEntity(entityId: string): Promise<Triple[]> {
// @TODO: For now we only delete triples one-level deep. Eventually we may want to
// handle cascading deletes if the triples deleted are the last triples in the entity.
//
// In that model we will need to track visited entities to avoid cycles in the graph.
// const descendants = new Set<Triple>();
// const visited = new Set<string>();

// const dfs = async (entityId: string) => {
// visited.add(entityId);

// for (const neighbor of neighbors) {
// See @TODO above
// if (visited.has(neighbor.id)) continue;

// See @TODO above
// if (!visited.has(neighbor.id)) {
// descendants.add(neighbor);

// See @TODO above
// dfs(neighbor.entityId);
// }
// }
// };

// See @TODO above
// await dfs(entityId);

//   const neighbors = await this.fetchNeighbors(entityId);

//   console.log('state', {
//     neighbors,
//   });

//   return Array.from(neighbors);
// }

//   async fetchReferencedByTriples(entityId: string) {
//     // Fetches edges for the given node at entityId
//     return await this.queryClient.fetchQuery({
//       queryKey: ['migrate-triples-referencing-entity', entityId],
//       queryFn: () =>
//         this.merged.fetchTriples({
//           query: '',
//           first: 1000,
//           skip: 0,
//           endpoint: this.appConfig.subgraph,
//           filter: [
//             {
//               field: 'linked-to',
//               value: entityId,
//             },
//           ],
//         }),
//     });
//   }
// }

export function useMigrateHub() {
  const { create, update, remove } = useActionsStore();
  const queryClient = useQueryClient();
  const merged = useMergedData();
  const { config: appConfig } = Services.useServices();

  const hub = React.useMemo(() => {
    return migrateHub({
      actionsApi: {
        create,
        update,
        remove,
      },
      merged,
      queryClient,
      appConfig,
    });
  }, [create, update, remove, queryClient, merged, appConfig]);

  return hub;
}

/**
 * We are making an event-system that listens for events and then does something with it.
 */

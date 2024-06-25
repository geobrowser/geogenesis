import { QueryClient, useQueryClient } from '@tanstack/react-query';

import React, { useTransition } from 'react';

import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { ID } from '../id';
import { createTripleId } from '../id/create-id';
import { Merged } from '../merged';
import {
  AppOp,
  Triple as ITriple,
  SetTripleAppOp,
  ValueType as TripleValueType,
  TripleWithDateValue,
  TripleWithStringValue,
  TripleWithUrlValue,
} from '../types';
import { groupBy } from '../utils/utils';
import {
  migrateDateTripleToStringTriple,
  migrateStringTripleToDateTriple,
  migrateStringTripleToUrlTriple,
  migrateUrlTripleToStringTriple,
} from './utils';

export type MigrateAction =
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

type MigrateOp = AppOp & {
  space: string;
};

interface MigrateHubConfig {
  actionsApi: {
    upsert: ReturnType<typeof useActionsStore>['upsert'];
    remove: ReturnType<typeof useActionsStore>['remove'];
  };
  queryClient: QueryClient;
  merged: Merged;
}

export interface IMigrateHub {
  dispatch: (action: MigrateAction) => Promise<MigrateOp[]>;
}

async function migrate(action: MigrateAction, config: MigrateHubConfig): Promise<MigrateOp[]> {
  switch (action.type) {
    case 'DELETE_ENTITY': {
      const { entityId } = action.payload;

      // @TODO: For now we only delete triples one-level deep, eventually we might
      // want cascading deletes when an entity is deleted. See the commented out
      // Graph class below for more details on the algo.
      const triplesReferencingEntity = await config.queryClient.fetchQuery({
        queryKey: ['migrate-triples-referencing-entity', entityId],
        queryFn: async () => {
          const triplesReferencingEntity: ITriple[] = [];

          const FIRST = 1000;
          let page = 0;
          let isRemainingTriples = false;

          // We can only fetch 1000 entries at a time from graph-node. If there are
          // more than 1000 entries we need to paginate until the end. We don't know
          // the number of entries ahead of time with graph-node, unfortunately.
          while (!isRemainingTriples) {
            const triplesChunk = await config.merged.fetchTriples({
              query: '',
              first: FIRST,
              skip: page * FIRST,
              filter: [
                {
                  field: 'linked-to',
                  value: entityId,
                },
              ],
            });

            // graph-node allows you to page past the last entry. Doing so will return an empty array.
            // We can use this to determine if we have reached the end of the triples. This will result
            // in an extra network call, but that's not a big deal right now. Newer Geo APIs will allow
            // us to know the number of entries ahead of time to avoid this.
            const newHead: ITriple | undefined = triplesChunk[0];

            if (!newHead) {
              isRemainingTriples = true;
            }

            page = page + 1;
            triplesReferencingEntity.push(...triplesChunk);
          }

          return triplesReferencingEntity;
        },
      });

      return triplesReferencingEntity.map(
        (t): MigrateOp => ({
          ...t,
          type: 'DELETE_TRIPLE',
          space: t.space,
          id: createTripleId(t),
        })
      );
    }
    case 'CHANGE_VALUE_TYPE': {
      const { attributeId, oldValueType, newValueType } = action.payload;

      const triplesWithAttribute = await config.queryClient.fetchQuery({
        queryKey: ['migrate-triples-with-attribute-id', attributeId],
        queryFn: async () => {
          const triplesReferencingEntity: ITriple[] = [];

          const FIRST = 1000;
          let page = 0;
          let isRemainingTriples = false;

          // We can only fetch 1000 entries at a time from graph-node. If there are
          // more than 1000 entries we need to paginate until the end. We don't know
          // the number of entries ahead of time with graph-node, unfortunately.
          while (!isRemainingTriples) {
            const triplesChunk = await config.merged.fetchTriples({
              query: '',
              first: FIRST,
              skip: page * FIRST,
              filter: [
                {
                  field: 'attribute-id',
                  value: attributeId,
                },
              ],
            });

            // graph-node allows you to page past the last entry. Doing so will return an empty array.
            // We can use this to determine if we have reached the end of the triples. This will result
            // in an extra network call, but that's not a big deal right now. Newer Geo APIs will allow
            // us to know the number of entries ahead of time to avoid this.
            const newHead: ITriple | undefined = triplesChunk[0];

            if (!newHead) {
              isRemainingTriples = true;
            }

            page = page + 1;
            triplesReferencingEntity.push(...triplesChunk);
          }

          return triplesReferencingEntity;
        },
      });

      /**
       * Attempt to migrate existing triples from oldValueType to newValueType.
       *
       * Currently we only support migrating the following changes:
       * string -> url
       * string -> date
       * date -> string
       * url -> string
       *
       * If we are migrating between types that can't be migrated we delete all
       * existing triples with the old type.
       */
      const triplesToDelete: ITriple[] = [];
      const triplesToUpdate: ITriple[] = [];

      for (const triple of triplesWithAttribute) {
        const value = triple.value;

        // We just delete the old triple if its value type does not match the value
        // type of the attribute.
        if (value.type !== oldValueType) {
          triplesToDelete.push(triple);
          continue;
        }

        switch (value.type) {
          // can migrate to date
          // can migrate to url
          // delete otherwise
          case 'TEXT': {
            switch (newValueType) {
              case 'URL': {
                const maybeMigratedTriple = migrateStringTripleToUrlTriple(
                  // Should be safe to cast here since we've type narrowed with the above
                  // switch statements.
                  triple as TripleWithStringValue
                );

                if (!maybeMigratedTriple) {
                  triplesToDelete.push(triple);
                  break;
                }

                triplesToUpdate.push(maybeMigratedTriple);
                break;
              }

              case 'TIME': {
                const maybeMigratedTriple = migrateStringTripleToDateTriple(
                  // Should be safe to cast here since we've type narrowed with the above
                  // switch statements.
                  triple as TripleWithStringValue
                );

                if (!maybeMigratedTriple) {
                  triplesToDelete.push(triple);
                  break;
                }

                triplesToUpdate.push(maybeMigratedTriple);
                break;
              }
            }

            triplesToDelete.push(triple);
            break;
          }

          // can migrate to string
          // delete otherwise
          case 'TIME': {
            if (newValueType === 'TEXT') {
              const newTriple = migrateDateTripleToStringTriple(
                // Should be safe to cast here since we've type narrowed with the above
                // switch statements.
                triple as TripleWithDateValue
              );

              triplesToUpdate.push(newTriple);
              break;
            }

            triplesToDelete.push(triple);
            break;
          }

          // can migrate to string
          // delete otherwise
          case 'URL': {
            if (newValueType === 'TEXT') {
              const newTriple = migrateUrlTripleToStringTriple(
                // Should be safe to cast here since we've type narrowed with the above
                // switch statements.
                triple as TripleWithUrlValue
              );

              triplesToUpdate.push(newTriple);
              break;
            }

            triplesToDelete.push(triple);
            break;
          }

          default:
            triplesToDelete.push(triple);
            break;
        }
      }

      const deleteActions: MigrateOp[] = triplesToDelete.map(t => ({
        ...t,
        type: 'DELETE_TRIPLE',
        id: createTripleId(t),
      }));

      const upsertActions: MigrateOp[] = triplesToUpdate.map(newTriple => ({
        ...newTriple,
        type: 'SET_TRIPLE',
        id: createTripleId(newTriple),
      }));

      return [...deleteActions, ...upsertActions];
    }
  }
}

function migrateHub(config: MigrateHubConfig): IMigrateHub {
  return {
    dispatch: async (action: MigrateAction) => await migrate(action, config),
  };
}

export function useMigrateHub() {
  const { upsert, remove, addActionsToSpaces } = useActionsStore();
  const queryClient = useQueryClient();
  const merged = useMergedData();

  const [, startTransition] = useTransition();

  const hub = React.useMemo(() => {
    return migrateHub({
      actionsApi: {
        upsert,
        remove,
      },
      merged,
      queryClient,
    });
  }, [remove, queryClient, merged]);

  const dispatch = React.useCallback(
    async (action: MigrateAction) => {
      const actions = await hub.dispatch(action);
      const actionsToBatch = groupBy([...actions], action => action.space);

      if (Object.keys(actionsToBatch).length === 0) {
        return;
      }

      startTransition(() => {
        addActionsToSpaces(actionsToBatch);
      });
    },

    [hub, addActionsToSpaces]
  );

  return {
    dispatch,
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

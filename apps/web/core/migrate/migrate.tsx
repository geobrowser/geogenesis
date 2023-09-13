import { batch } from '@legendapp/state';
import { QueryClient } from '@tanstack/query-core';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import React from 'react';

import { Environment } from '../environment';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { Merged } from '../merged';
import { Services } from '../services';
import { ActionsStore } from '../state/actions-store';
import { Triple as ITriple, TripleValueType } from '../types';
import { Triple } from '../utils/triple';
import { GeoDate } from '../utils/utils';

dayjs.extend(utc);

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
  dispatch: (action: MigrateAction) => Promise<void>;
}

async function migrate(action: MigrateAction, config: MigrateHubConfig) {
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
              endpoint: config.appConfig.subgraph,
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

      batch(() => {
        triplesReferencingEntity.forEach(t => {
          config.actionsApi.remove(t);
        });
      });
      break;
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
              endpoint: config.appConfig.subgraph,
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
      batch(() => {
        for (const triple of triplesWithAttribute) {
          // config.actionsApi.remove(triple);

          const value = triple.value;

          // @TODO: For now we just delete the old triple
          if (value.type !== oldValueType) {
            // delete
            config.actionsApi.remove(triple);
            continue;
          }

          switch (value.type) {
            // can migrate to date
            // can migrate to url
            // delete otherwise
            case 'string': {
              switch (newValueType) {
                case 'url': {
                  if (value.value.startsWith('https://')) {
                    const newTriple = Triple.ensureStableId({
                      ...triple,
                      value: {
                        ...value,
                        type: 'url',
                        value: value.value,
                      },
                    });

                    config.actionsApi.update(newTriple, triple);
                  }
                  break;
                }

                case 'date': {
                  // We only attempt to convert dates that are in the format MM/DD/YYYY. There is
                  // an infinite number of potential date formats (and formatting errors) with a
                  // raw string. The simplest is to choose a single format and delete any triples
                  // that don't match the correct format.
                  const date = dayjs.utc(value.value, 'MM/DD/YYYY');

                  if (!date.isValid()) {
                    config.actionsApi.remove(triple);
                    break;
                  }

                  const newTriple = Triple.ensureStableId({
                    ...triple,
                    value: {
                      ...value,
                      type: 'string',
                      value: date.toISOString(),
                    },
                  });

                  config.actionsApi.update(newTriple, triple);
                  break;
                }
              }

              config.actionsApi.remove(triple);
              break;
            }

            // can migrate to string
            // delete otherwise
            case 'date': {
              if (newValueType === 'string') {
                const { day, month, year } = GeoDate.fromISOStringUTC(value.value);

                const newTriple = Triple.ensureStableId({
                  ...triple,
                  value: {
                    ...value,
                    type: 'string',
                    value: `${month}/${day}/${year}`,
                  },
                });

                config.actionsApi.update(newTriple, triple);
                break;
              }

              config.actionsApi.remove(triple);
              break;
            }

            // can migrate to string
            // delete otherwise
            case 'url': {
              if (newValueType === 'string') {
                const newTriple = Triple.ensureStableId({
                  ...triple,
                  value: {
                    ...value,
                    type: 'string',
                    value: value.value,
                  },
                });

                config.actionsApi.update(newTriple, triple);
                break;
              }

              config.actionsApi.remove(triple);
              break;
            }

            default:
              config.actionsApi.remove(triple);
              break;
          }
        }
      });
    }
  }
}

function migrateHub(config: MigrateHubConfig): IMigrateHub {
  return {
    dispatch: async (action: MigrateAction) => await migrate(action, config),
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

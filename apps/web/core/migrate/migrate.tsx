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

class MigrateHub implements IMigrateHub {
  private actionsApi: MigrateHubConfig['actionsApi'];
  private queryClient: MigrateHubConfig['queryClient'];
  private merged: MigrateHubConfig['merged'];
  private appConfig: MigrateHubConfig['appConfig'];

  constructor(migrateConfig: MigrateHubConfig) {
    this.actionsApi = migrateConfig.actionsApi;
    this.queryClient = migrateConfig.queryClient;
    this.merged = migrateConfig.merged;
    this.appConfig = migrateConfig.appConfig;
  }

  // This _might_ need to be a queue if the actions generated are causing performance
  // problems. This would mean that the review UI would need to be blocking while
  // the queue completes.
  async migrate(action: MigrateAction) {
    switch (action.type) {
      case 'DELETE_ENTITY': {
        const { entityId } = action.payload;

        const triplesReferencingEntity = await this.queryClient.fetchQuery({
          queryKey: ['migrate-triples-referencing-entity', entityId],
          queryFn: () =>
            this.merged.fetchTriples({
              query: '',
              first: 1000,
              skip: 0,
              endpoint: this.appConfig.subgraph,
              filter: [
                {
                  field: 'linked-to',
                  value: entityId,
                },
              ],
            }),
        });

        return;
      }
      case 'CHANGE_VALUE_TYPE':
        return;
    }
  }
}

export function useMigrateHub() {
  const { create, update, remove } = useActionsStore();
  const queryClient = useQueryClient();
  const merged = useMergedData();
  const { config: appConfig } = Services.useServices();

  const hub = React.useMemo(() => {
    return new MigrateHub({
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

import { A } from '@mobily/ts-belt';

import * as React from 'react';

import { WalletClient, useWalletClient } from 'wagmi';

import { Publish, Storage } from '../io';
import { Services } from '../services';
import { Action as IAction, OmitStrict, ReviewState } from '../types';
import { Action } from '../utils/action';
import { useActionsStore } from './use-actions-store';

interface IPublishOptions {
  storageClient: Storage.IStorageClient;
  actions: IAction[];
  wallet: WalletClient;
  onChangePublishState: (newState: ReviewState) => void;
  spaceId: string;
  name: string;
  onPublish: typeof Publish['publish'];
}

// 2. Write tests for splitActions and publish

export function usePublish() {
  const { storageClient, publish: publishService } = Services.useServices();
  const { restore, actions: actionsBySpace } = useActionsStore();
  const { data: wallet } = useWalletClient();

  const publishFn = React.useCallback(
    async ({
      actions: actionsToPublish,
      name,
      onChangePublishState,
      spaceId,
    }: OmitStrict<IPublishOptions, 'onPublish' | 'wallet' | 'storageClient'>) => {
      if (!wallet) return;
      if (actionsToPublish.length < 1) return;

      await publishService.publish({
        storageClient,
        actions: Action.prepareActionsForPublishing(actionsToPublish),
        name,
        onChangePublishState,
        space: spaceId,
        wallet,
      });

      const actionsBeingPublished = new Set(
        actionsToPublish.map(a => {
          switch (a.type) {
            case 'createTriple':
            case 'deleteTriple':
              return a.id;
            case 'editTriple':
              return a.after.id; // after and before should the same id
          }
        })
      );

      // We want to look at the actionsFromSpace and filter out any actions that we just published
      // we want to set the new actions to the actions we just filtered
      const nonPublishedActions = actionsBySpace[spaceId].filter(a => {
        switch (a.type) {
          case 'createTriple':
          case 'deleteTriple':
            return !actionsBeingPublished.has(a.id); // after and before should the same id
          case 'editTriple':
            return !actionsBeingPublished.has(a.after.id); // after and before should the same id
        }
      });

      const publishedActions = actionsToPublish.map(action => ({
        ...action,
        hasBeenPublished: true,
      }));

      // Update the actionsBySpace for the current space to set the published actions
      // as hasBeenPublished and merge with the existing actions in the space.
      restore({
        ...actionsBySpace,
        [spaceId]: [...publishedActions, ...nonPublishedActions],
      });
    },
    [storageClient, wallet, publishService, restore, actionsBySpace]
  );

  return {
    publish: publishFn,
  };
}

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

export function usePublish() {
  const { storageClient, publish: publishService } = Services.useServices();
  const { restore, actions: actionsBySpace } = useActionsStore();
  const { data: wallet } = useWalletClient();

  /**
   * Take the actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   *
   * After the publish flow finishes update the state of the user's actions for the given
   * space with the published actions being flagged as `hasBeenPublished` and run any additional
   * side effects.
   */
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

      // We filter out the actions that are being published from the actionsBySpace. We do this
      // since we need to update the entire state of the space with the published actions and the
      // unpublished actions being merged together.
      const nonPublishedActions = actionsBySpace[spaceId].filter(a => {
        switch (a.type) {
          case 'createTriple':
          case 'deleteTriple':
            return !actionsBeingPublished.has(a.id);
          case 'editTriple':
            return !actionsBeingPublished.has(a.after.id);
        }
      });

      const publishedActions = actionsToPublish.map(action => ({
        ...action,
        // We keep published actions in memory to keep the UI optimistic. This is mostly done
        // because there is a period between publishing actions and the subgraph finishing indexing
        // where the UI would be in a state where the published actions are not showing up in the UI.
        // Instead we keep the actions in memory so the UI is up-to-date while the subgraph indexes.
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

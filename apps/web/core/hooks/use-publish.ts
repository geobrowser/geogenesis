import * as React from 'react';

import { WalletClient, useWalletClient } from 'wagmi';

import { Publish, Storage } from '../io';
import { Services } from '../services';
import { Action as IAction, OmitStrict, ReviewState } from '../types';
import { Action } from '../utils/action';

/**
 * actionsStore.publish is primarily called from react components
 * 1. We want to be able to pass in the actions that we want to publish
 * 2. We want to be able to expose the actionsStore.publish in a way where react
 *    components can use them and be able to mock for testing
 * 3. We want to be able to mock the `Publish.publish` call for testing, which means
 *    we probably need to pass this in as well.
 *
 * 4. We need to update all the publish callsites to use the new implementation
 */

interface IPublishOptions {
  storageClient: Storage.IStorageClient;
  actions: IAction[];
  wallet: WalletClient;
  onChangePublishState: (newState: ReviewState) => void;
  spaceId: string;
  name: string;
  onPublish: typeof Publish['publish'];
}

// 1. Figure out how to correctly persist the actions after publishing with hasBeenPublished
// 2. Write tests for splitActions and publish

export function usePublish() {
  const { storageClient, publish: publishService } = Services.useServices();
  const { data: wallet } = useWalletClient();

  const publishFn = React.useCallback(
    async ({
      actions,
      name,
      onChangePublishState,
      spaceId,
    }: OmitStrict<IPublishOptions, 'onPublish' | 'wallet' | 'storageClient'>) => {
      if (!wallet) return;
      if (actions.length < 1) return;

      await publishService.publish({
        storageClient,
        actions: Action.prepareActionsForPublishing(actions),
        name,
        onChangePublishState,
        space: spaceId,
        wallet,
      });
    },
    [storageClient, wallet, publishService]
  );

  return {
    publish: publishFn,
  };
}

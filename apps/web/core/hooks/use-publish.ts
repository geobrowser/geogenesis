import * as React from 'react';

import { useWalletClient } from 'wagmi';

import { Services } from '../services';
import { Triple as ITriple, ReviewState } from '../types';
import { Action } from '../utils/action';
import { Triple } from '../utils/triple';
import { useActionsStore } from './use-actions-store';

interface MakeProposalOptions {
  triples: ITriple[];
  onChangePublishState: (newState: ReviewState) => void;
  spaceId: string;
  name: string;
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
  const makeProposal = React.useCallback(
    async ({ triples: triplesToPublish, name, onChangePublishState, spaceId }: MakeProposalOptions) => {
      if (!wallet) return;
      if (triplesToPublish.length < 1) return;

      await publishService.makeProposal({
        storageClient,
        ops: Triple.prepareTriplesForPublishing(triplesToPublish, spaceId),
        name,
        onChangePublishState,
        space: spaceId,
        wallet,
      });

      const actionsBeingPublished = new Set(
        triplesToPublish.map(a => {
          return a.id;
        })
      );

      // We filter out the actions that are being published from the actionsBySpace. We do this
      // since we need to update the entire state of the space with the published actions and the
      // unpublished actions being merged together.
      // If the actionsBySpace[spaceId] is empty, then we return an empty array
      const nonPublishedActions = actionsBySpace[spaceId]
        ? actionsBySpace[spaceId].filter(a => {
            return !actionsBeingPublished.has(a.id);
          })
        : [];

      const publishedActions = triplesToPublish.map(action => ({
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
    makeProposal,
    // @TODO: This should also include APIs for granting and revoking roles
  };
}

export function useBulkPublish() {
  const { storageClient, publish } = Services.useServices();
  const { data: wallet } = useWalletClient();

  /**
   * Take the bulk actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   */
  const makeBulkProposal = React.useCallback(
    async ({ triples, name, onChangePublishState, spaceId }: MakeProposalOptions) => {
      if (!wallet) return;
      if (triples.length < 1) return;

      await publish.makeProposal({
        storageClient,
        ops: Triple.prepareTriplesForPublishing(triples, spaceId),
        name,
        onChangePublishState,
        space: spaceId,
        wallet,
      });
    },
    [storageClient, wallet, publish]
  );

  return {
    makeBulkProposal,
  };
}

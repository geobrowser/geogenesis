'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { BOUNTIES_RELATION_TYPE, PROPOSAL_TYPE_ID } from '~/core/constants';
import { usePublish } from '~/core/hooks/use-publish';
import { ID } from '~/core/id';
import type { Relation as StoreRelation, Value as StoreValue } from '~/core/types';

import type { Bounty } from './types';

type PublishBountyLinksArgs = {
  /** The Proposal entity id. For new proposals this is the same value passed as `proposalId` to
   *  `makeProposal`; for post-hoc linking from the proposal view it is `proposal.id`. */
  proposalId: string;
  /** Display name for the proposal entity and for the "Bounty links for: …" proposal name. */
  proposalName: string;
  /** The DAO space the bounties live in when it differs from the author's personal space. Left
   *  undefined when the two are the same. */
  toSpaceId?: string;
  /** Bounty ids to create relations for. */
  bountyIds: Set<string>;
  /** Lookup to resolve each id → its display name for the relation payload. */
  bountiesById: Map<string, Bounty>;
  onSuccess?: () => void;
  onError?: () => void;
};

type UsePublishBountyLinksArgs = {
  personalSpaceId: string | null;
};

/**
 * Publishes a "Bounty links for: {proposalName}" proposal into the author's personal space,
 * creating a Proposal entity (identified by `proposalId`) and one `Bounties` relation per
 * selected bounty. Extracted from the inline logic in `review-changes.tsx` so the same
 * machinery can be invoked post-hoc from the proposal voting screen.
 */
export function usePublishBountyLinks({ personalSpaceId }: UsePublishBountyLinksArgs): {
  publish: (args: PublishBountyLinksArgs) => Promise<void>;
  isPublishing: boolean;
} {
  const { makeProposal } = usePublish();
  const [isPublishing, setIsPublishing] = React.useState(false);

  const publish = React.useCallback(
    async ({ proposalId, proposalName, toSpaceId, bountyIds, bountiesById, onSuccess, onError }: PublishBountyLinksArgs) => {
      if (!personalSpaceId) {
        onError?.();
        return;
      }
      if (bountyIds.size === 0) {
        onSuccess?.();
        return;
      }

      setIsPublishing(true);
      let settled = false;
      const settle = (success: boolean) => {
        if (settled) return;
        settled = true;
        if (success) onSuccess?.();
        else onError?.();
      };

      try {
        const bountyLinkValues: StoreValue[] = [
          {
            id: ID.createValueId({
              entityId: proposalId,
              propertyId: SystemIds.NAME_PROPERTY,
              spaceId: personalSpaceId,
            }),
            entity: {
              id: proposalId,
              name: proposalName,
            },
            property: {
              id: SystemIds.NAME_PROPERTY,
              name: 'Name',
              dataType: 'TEXT',
            },
            spaceId: personalSpaceId,
            value: proposalName,
            isLocal: true,
            isDeleted: false,
            hasBeenPublished: false,
            timestamp: new Date().toISOString(),
          },
        ];

        const proposalTypeRelation: StoreRelation = {
          id: ID.createEntityId(),
          entityId: ID.createEntityId(),
          spaceId: personalSpaceId,
          renderableType: 'RELATION',
          verified: false,
          position: Position.generate(),
          type: {
            id: SystemIds.TYPES_PROPERTY,
            name: 'Types',
          },
          fromEntity: {
            id: proposalId,
            name: proposalName,
          },
          toEntity: {
            id: PROPOSAL_TYPE_ID,
            name: 'Proposal',
            value: PROPOSAL_TYPE_ID,
          },
        };

        const bountyLinkRelations: StoreRelation[] = [
          proposalTypeRelation,
          ...Array.from(bountyIds).flatMap<StoreRelation>(bountyId => {
            const bounty = bountiesById.get(bountyId);
            if (!bounty) return [];
            return [
              {
                id: ID.createEntityId(),
                entityId: ID.createEntityId(),
                spaceId: personalSpaceId,
                toSpaceId,
                renderableType: 'RELATION',
                verified: false,
                position: Position.generate(),
                type: {
                  id: BOUNTIES_RELATION_TYPE,
                  name: 'Bounties',
                },
                fromEntity: {
                  id: proposalId,
                  name: proposalName,
                },
                toEntity: {
                  id: bounty.id,
                  name: bounty.name,
                  value: bounty.id,
                },
              },
            ];
          }),
        ];

        // `makeProposal` has several early-return paths (no smart account, no space, empty
        // ops) where it resolves without invoking either callback. Capture the promise
        // resolution and, if neither callback has fired by then, surface a failure through
        // `onError` so consumers can react deterministically.
        try {
          await makeProposal({
            values: bountyLinkValues,
            relations: bountyLinkRelations,
            spaceId: personalSpaceId,
            name: `Bounty links for: ${proposalName}`,
            onSuccess: () => settle(true),
            onError: () => settle(false),
          });
        } catch {
          settle(false);
          return;
        }
        settle(false);
      } finally {
        setIsPublishing(false);
      }
    },
    [makeProposal, personalSpaceId]
  );

  return { publish, isPublishing };
}
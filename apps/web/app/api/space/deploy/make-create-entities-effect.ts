import { SYSTEM_IDS } from '@geogenesis/ids';
import { Op as IOp } from '@geogenesis/sdk';
import * as Effect from 'effect/Effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { SpaceType } from '~/core/types';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '~/core/utils/ops';
import { slog } from '~/core/utils/utils';

import { geoAccount, publicClient, walletClient } from '../../client';
import { CreateSpaceEntitiesFailedError } from '../../errors';
import { makeProposalServer } from '../../make-proposal-server';

interface UserConfig {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceAddress: string;
}

export function makeCreateEntitiesEffect(
  requestId: string,
  { type, spaceName, spaceAvatarUri, spaceAddress }: UserConfig
) {
  // Create the profile entity representing the new user and space configuration for this space
  // in the Geo knowledge graph.
  //
  // The id for this entity is the same as the on-chain profile id.
  const createEntitiesEffect = Effect.tryPromise({
    try: async () => {
      const ops: IOp[] = [];
      const newEntityId = ID.createEntityId();

      // Add triples for a Person entity
      ops.push(
        Ops.create({
          entityId: newEntityId,
          attributeId: SYSTEM_IDS.NAME,
          value: {
            type: 'TEXT',
            value: spaceName,
          },
        })
      );

      ops.push(
        Ops.create({
          entityId: newEntityId,
          attributeId: SYSTEM_IDS.TYPES,
          value: {
            type: 'ENTITY',
            value: SYSTEM_IDS.SPACE_CONFIGURATION,
          },
        })
      );

      if (spaceAvatarUri) {
        ops.push(
          Ops.create({
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
            value: {
              // @TODO: create the image entity
              type: 'ENTITY',
              value: spaceAvatarUri,
            },
          })
        );
      }

      if (type === 'company') {
        ops.push(
          Ops.create({
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            value: {
              type: 'ENTITY',
              value: SYSTEM_IDS.COMPANY_TYPE,
            },
          })
        );
      }

      // Nonprofit spaces have both Nonprofit _and_ Project added as types
      if (type === 'nonprofit') {
        ops.push(
          Ops.create({
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            value: {
              type: 'ENTITY',
              value: SYSTEM_IDS.NONPROFIT_TYPE,
            },
          })
        );

        ops.push(
          Ops.create({
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            value: {
              type: 'ENTITY',
              value: SYSTEM_IDS.PROJECT_TYPE,
            },
          })
        );

        const nonprofitActions = generateTriplesForNonprofit(newEntityId, spaceName, spaceAddress);

        ops.push(...nonprofitActions);
      }

      slog({
        requestId,
        message: `Adding entities for ${type} space type to space ${spaceAddress}`,
      });

      const proposalEffect = await makeProposalServer({
        ops,
        name: `Creating entities for new space ${spaceAddress}`,
        space: spaceAddress,
        storageClient: new StorageClient(Environment.getConfig().ipfs),
        account: geoAccount,
        wallet: walletClient,
        publicClient: publicClient,
      });

      await Effect.runPromise(proposalEffect);

      slog({
        requestId,
        message: `Successfully added profile to space ${spaceAddress}`,
      });
    },
    catch: error => {
      slog({
        level: 'error',
        requestId,
        message: `Creating Geo entity Profile in space address ${spaceAddress} failed: ${(error as Error).message}`,
      });
      return new CreateSpaceEntitiesFailedError();
    },
  });

  return createEntitiesEffect;
}

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Op as IOp } from '@geogenesis/sdk';
import * as Effect from 'effect/Effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { SpaceType } from '~/core/types';
import { generateTriplesForCompany } from '~/core/utils/contracts/generate-triples-for-company';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '~/core/utils/ops';
import { Triple } from '~/core/utils/triple';
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
      if (type === 'default') {
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
      }

      if (type === 'company') {
        const companyTriples = await generateTriplesForCompany(newEntityId, spaceName, spaceAddress);
        ops.push(...Triple.prepareTriplesForPublishing(companyTriples, spaceAddress));
      }

      if (type === 'nonprofit') {
        const nonprofitTriples = await generateTriplesForNonprofit(newEntityId, spaceName, spaceAddress);
        ops.push(...Triple.prepareTriplesForPublishing(nonprofitTriples, spaceAddress));
      }

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

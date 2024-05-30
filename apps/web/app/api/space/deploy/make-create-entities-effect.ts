import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { CreateTripleAction, OmitStrict, SpaceType, Triple } from '~/core/types';
import { generateActionsForCompany } from '~/core/utils/contracts/generate-actions-for-company';
import { generateActionsForNonprofit } from '~/core/utils/contracts/generate-actions-for-nonprofit';
import { slog } from '~/core/utils/utils';

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
  const account = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  // Create the profile entity representing the new user and space configuration for this space
  // in the Geo knowledge graph.
  //
  // The id for this entity is the same as the on-chain profile id.
  const createEntitiesEffect = Effect.tryPromise({
    try: async () => {
      const actions: CreateTripleAction[] = [];
      const newEntityId = ID.createEntityId();

      // Add triples for a Person entity
      if (type === 'default') {
        const nameTriple: OmitStrict<Triple, 'id'> = {
          entityId: newEntityId,
          entityName: spaceName,
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          space: spaceAddress,
          value: {
            type: 'string',
            value: spaceName,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(nameTriple),
          ...nameTriple,
        });
      }

      if (type === 'company') {
        const companyActions = await generateActionsForCompany(newEntityId, spaceName, spaceAddress);

        actions.push(...companyActions);
      }

      if (type === 'nonprofit') {
        const nonprofitActions = await generateActionsForNonprofit(newEntityId, spaceName, spaceAddress);

        actions.push(...nonprofitActions);
      }

      if (spaceAvatarUri) {
        const avatarTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: newEntityId,
          entityName: spaceName,
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          space: spaceAddress,
          value: {
            type: 'image',
            value: spaceAvatarUri,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(avatarTripleWithoutId),
          ...avatarTripleWithoutId,
        });
      }

      slog({
        requestId,
        message: `Adding entities for ${type} space type to space ${spaceAddress}`,
      });

      const proposalEffect = await makeProposalServer({
        actions,
        name: `Creating entities for new space ${spaceAddress}`,
        space: spaceAddress,
        storageClient: new StorageClient(Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).ipfs),
        account,
        wallet: client,
        publicClient,
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

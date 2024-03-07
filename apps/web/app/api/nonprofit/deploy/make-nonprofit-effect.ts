import { SpaceArtifact } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

import { ADMIN_ROLE_BINARY, EDITOR_CONTROLLER_ROLE_BINARY, EDITOR_ROLE_BINARY } from '~/core/constants';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { CreateTripleAction, OmitStrict, Triple } from '~/core/types';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { slog } from '~/core/utils/utils';

import { makeProposalServer } from '../../make-proposal-server';

type Role = {
  role: string;
  binary: string;
};

const ROLES: Role[] = [
  {
    role: 'EDITOR_ROLE',
    binary: EDITOR_ROLE_BINARY,
  },
  {
    role: 'EDITOR_CONTROLLER_ROLE',
    binary: EDITOR_CONTROLLER_ROLE_BINARY,
  },
  {
    role: 'ADMIN_ROLE',
    binary: ADMIN_ROLE_BINARY,
  },
];

class GrantRoleError extends Error {
  readonly _tag = 'GrantAdminRole';
}

class RenounceRoleError extends Error {
  readonly _tag = 'RenounceRoleError';
}

class CreateProfileGeoEntityFailedError extends Error {
  readonly _tag = 'CreateProfileGeoEntityFailedError';
}

interface UserConfig {
  profileId: string;
  account: `0x${string}`;
  username: string | null;
  avatarUri: string | null;
  spaceAddress: string;
}

/**
 * This function creates the off-chain profile entity representing the new user in the Geo knowledge
 * graph and makes sure that it is correctly associated with the on-chain profile.
 *
 * Profiles in Geo are comprised of two elements:
 * 1. The on-chain profile with an identifier and home space address
 * 2. The off-chain profile entity in the Geo knowledge graph. This has the same id as the
 *    on-chain id and has arbitrary metadata in the form of triples.
 *
 * Additionally, it grants the new user each role in the space and removes the deployer from
 * each role.
 */
export async function makeNonprofitEffect(
  requestId: string,
  { account: userAccount, username, avatarUri, spaceAddress, profileId }: UserConfig
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
  const profileEffect = Effect.tryPromise({
    try: async () => {
      const actions: CreateTripleAction[] = [];

      // Add triples for a Person entity
      if (username) {
        const nameTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: profileId,
          entityName: username ?? '',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          space: spaceAddress,
          value: {
            type: 'string',
            value: username,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(nameTripleWithoutId),
          ...nameTripleWithoutId,
        });
      }

      if (avatarUri) {
        const avatarTripleWithoutId: OmitStrict<Triple, 'id'> = {
          entityId: profileId,
          entityName: username ?? '',
          attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
          attributeName: 'Avatar',
          space: spaceAddress,
          value: {
            type: 'image',
            value: avatarUri,
            id: ID.createValueId(),
          },
        };

        actions.push({
          type: 'createTriple',
          id: ID.createTripleId(avatarTripleWithoutId),
          ...avatarTripleWithoutId,
        });
      }

      // Add Types: Nonprofit Organization and Project to the profile entity
      const nonprofitTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Nonprofit Organization',
          id: SYSTEM_IDS.NONPROFIT_TYPE,
        },
      };

      const projectTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Project',
          id: SYSTEM_IDS.PROJECT_TYPE,
        },
      };

      const spaceTypeTriple: OmitStrict<Triple, 'id'> = {
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        entityId: profileId,
        entityName: username ?? '',
        space: spaceAddress,
        value: {
          type: 'entity',
          name: 'Space',
          id: SYSTEM_IDS.SPACE_CONFIGURATION,
        },
      };

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(nonprofitTypeTriple),
        ...nonprofitTypeTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(projectTypeTriple),
        ...projectTypeTriple,
      });

      actions.push({
        type: 'createTriple',
        id: ID.createTripleId(spaceTypeTriple),
        ...spaceTypeTriple,
      });

      const nonprofitActions = generateTriplesForNonprofit(profileId, username ?? '', spaceAddress);

      actions.push(...nonprofitActions);

      slog({
        requestId,
        message: `Adding profile to space ${spaceAddress}`,
        account: userAccount,
      });

      const proposalEffect = await makeProposalServer({
        actions,
        name: `Creating profile for ${userAccount}`,
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
        account: userAccount,
      });
    },
    catch: error => {
      slog({
        level: 'error',
        requestId,
        message: `Creating Geo entity Profile in space address ${spaceAddress} failed: ${(error as Error).message}`,
        account: userAccount,
      });
      return new CreateProfileGeoEntityFailedError();
    },
  });

  // Grant each role to the new user
  const createGrantRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateGrantRoleResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: spaceAddress as `0x${string}`,
          functionName: 'grantRole',
          account,
          args: [role.binary, userAccount],
        });

        const grantRoleSimulateHash = await client.writeContract(simulateGrantRoleResult.request);
        slog({
          requestId,
          message: `Grant ${role.role} role hash: ${grantRoleSimulateHash}`,
          account: userAccount,
        });

        const grantRoleTxHash = await publicClient.waitForTransactionReceipt({
          hash: grantRoleSimulateHash,
        });
        slog({
          requestId,
          message: `Granted ${role.role} role for ${spaceAddress}: ${grantRoleTxHash.transactionHash}`,
          account: userAccount,
        });

        return grantRoleSimulateHash;
      },
      catch: error => {
        slog({
          level: 'error',
          requestId,
          message: `Granting ${role.role} role failed: ${(error as Error).message}`,
          account: userAccount,
        });
        return new GrantRoleError();
      },
    });
  };

  // Renounce each role from the deployer
  const createRenounceRoleEffect = (role: Role) => {
    return Effect.tryPromise({
      try: async () => {
        const simulateRenounceRoleResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: spaceAddress as `0x${string}`,
          functionName: 'renounceRole',
          account,
          args: [role.binary, account.address],
        });

        const grantRoleSimulateHash = await client.writeContract(simulateRenounceRoleResult.request);
        slog({
          requestId,
          message: `Renounce ${role.role} role hash: ${grantRoleSimulateHash}`,
          account: userAccount,
        });

        const renounceRoleTxResult = await publicClient.waitForTransactionReceipt({
          hash: grantRoleSimulateHash,
        });
        slog({
          requestId,
          message: `Renounced ${role.role} role for Geo deployer ${spaceAddress}: ${renounceRoleTxResult.transactionHash}`,
          account: userAccount,
        });

        return renounceRoleTxResult;
      },
      catch: error => {
        slog({
          level: 'error',
          requestId,
          message: `Renouncing ${role.role} role failed: ${(error as Error).message}`,
          account: userAccount,
        });
        return new RenounceRoleError();
      },
    });
  };

  const onboardEffect = Effect.gen(function* (unwrap) {
    // Add geo profile entity to new space
    yield* unwrap(Effect.retry(profileEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered)));

    // @TODO: Batch?
    // Configure roles in proxy contract
    for (const role of ROLES) {
      const grantRoleEffect = createGrantRoleEffect(role);
      yield* unwrap(Effect.retry(grantRoleEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered)));
    }

    // @TODO Batch?
    // Renounce deployer roles in proxy contract
    for (const role of ROLES) {
      const renounceRoleEffect = createRenounceRoleEffect(role);
      yield* unwrap(Effect.retry(renounceRoleEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered)));
    }
  });

  return onboardEffect;
}

import { SYSTEM_IDS } from '@geogenesis/ids';
import { Op as IOp } from '@geogenesis/sdk';
import { LegacySpaceAbi } from '@geogenesis/sdk/legacy';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

import { ADMIN_ROLE_BINARY, EDITOR_CONTROLLER_ROLE_BINARY, EDITOR_ROLE_BINARY } from '~/core/constants';
import { Environment } from '~/core/environment';
import { StorageClient } from '~/core/io/storage/storage';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '~/core/utils/ops';
import { slog } from '~/core/utils/utils';

import { geoAccount, publicClient, walletClient } from '../../client';
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
  // Create the profile entity representing the new user and space configuration for this space
  // in the Geo knowledge graph.
  //
  // The id for this entity is the same as the on-chain profile id.
  const profileEffect = Effect.tryPromise({
    try: async () => {
      const ops: IOp[] = [];

      // Add triples for a Person entity
      if (username) {
        ops.push(
          Ops.create({
            entityId: profileId,
            attributeId: SYSTEM_IDS.NAME,
            value: {
              type: 'TEXT',
              value: username,
            },
          })
        );
      }

      if (avatarUri) {
        ops.push(
          Ops.create({
            entityId: profileId,
            attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
            value: {
              type: 'IMAGE',
              value: avatarUri,
            },
          })
        );
      }

      // Add Types: Nonprofit Organization and Project to the profile entity
      ops.push(
        Ops.create({
          entityId: profileId,
          attributeId: SYSTEM_IDS.TYPES,
          value: {
            type: 'ENTITY',
            value: SYSTEM_IDS.NONPROFIT_TYPE,
          },
        })
      );

      ops.push(
        Ops.create({
          entityId: profileId,
          attributeId: SYSTEM_IDS.TYPES,
          value: {
            type: 'ENTITY',
            value: SYSTEM_IDS.PROJECT_TYPE,
          },
        })
      );

      ops.push(
        Ops.create({
          entityId: profileId,
          attributeId: SYSTEM_IDS.TYPES,
          value: {
            type: 'ENTITY',
            value: SYSTEM_IDS.SPACE_CONFIGURATION,
          },
        })
      );

      const nonprofitActions = generateTriplesForNonprofit(profileId, username ?? '', spaceAddress);

      ops.push(...nonprofitActions);

      slog({
        requestId,
        message: `Adding nonprofit entity to space ${spaceAddress}`,
        account: userAccount,
      });

      const proposalEffect = await makeProposalServer({
        ops,
        name: `Creating profile for ${userAccount}`,
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
          abi: LegacySpaceAbi,
          address: spaceAddress as `0x${string}`,
          functionName: 'grantRole',
          account: geoAccount,
          args: [role.binary as `0x${string}`, userAccount],
        });

        const grantRoleSimulateHash = await walletClient.writeContract(simulateGrantRoleResult.request);
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
          abi: LegacySpaceAbi,
          address: spaceAddress as `0x${string}`,
          functionName: 'renounceRole',
          account: geoAccount,
          args: [role.binary as `0x${string}`, geoAccount.address],
        });

        const grantRoleSimulateHash = await walletClient.writeContract(simulateRenounceRoleResult.request);
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

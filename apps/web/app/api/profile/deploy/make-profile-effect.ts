import { SpaceArtifact } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

import { ADMIN_ROLE_BINARY, EDITOR_CONTROLLER_ROLE_BINARY, EDITOR_ROLE_BINARY } from '~/core/constants';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { CreateTripleAction, OmitStrict, Triple } from '~/core/types';
import { slog } from '~/core/utils/utils';

import { makeProposalServer } from '../../make-proposal-server';

const ROLES = [
  {
    role: 'ADMIN_ROLE',
    binary: ADMIN_ROLE_BINARY,
  },
  {
    role: 'EDITOR_ROLE',
    binary: EDITOR_ROLE_BINARY,
  },
  {
    role: 'EDITOR_CONTROLLER_ROLE',
    binary: EDITOR_CONTROLLER_ROLE_BINARY,
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

export async function makeProfileEffect(
  requestId: string,
  { account: userAccount, username, avatarUri, spaceAddress, profileId }: UserConfig
) {
  const account = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
    // transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  const createProfileEntityEffect = Effect.gen(function* (unwrap) {
    // Add geo profile entity to new space
    yield* unwrap(
      Effect.tryPromise({
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
              // @TODO: Somehow link to on-chain profilePerson
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

          const typeTriple: OmitStrict<Triple, 'id'> = {
            attributeId: SYSTEM_IDS.TYPES,
            attributeName: 'Types',
            entityId: profileId,
            entityName: username ?? '',
            space: spaceAddress,
            value: {
              type: 'entity',
              name: 'Person',
              id: SYSTEM_IDS.PERSON_TYPE,
            },
          };

          actions.push({
            type: 'createTriple',
            id: ID.createTripleId(typeTriple),
            ...typeTriple,
          });

          // Add triples for creating a space configuration entity
          const spaceConfigurationId = ID.createEntityId();

          const spaceTriple: OmitStrict<Triple, 'id'> = {
            attributeId: SYSTEM_IDS.TYPES,
            attributeName: 'Types',
            entityId: spaceConfigurationId,
            entityName: `${username ?? userAccount}'s Space`,
            space: spaceAddress,
            value: {
              type: 'entity',
              name: 'Space',
              id: SYSTEM_IDS.SPACE_CONFIGURATION,
            },
          };

          actions.push({
            type: 'createTriple',
            id: ID.createTripleId(spaceTriple),
            ...spaceTriple,
          });

          const spaceNameTriple: OmitStrict<Triple, 'id'> = {
            attributeId: SYSTEM_IDS.NAME,
            attributeName: 'Name',
            entityId: spaceConfigurationId,
            entityName: `${username ?? userAccount}'s Space`,
            space: spaceAddress,
            value: {
              type: 'string',
              value: `${username ?? userAccount}'s Space`,
              id: ID.createValueId(),
            },
          };

          actions.push({
            type: 'createTriple',
            id: ID.createTripleId(spaceNameTriple),
            ...spaceNameTriple,
          });

          slog({
            requestId,
            message: `Adding profile to space ${spaceAddress}`,
            account: userAccount,
          });

          const proposalEffect = await makeProposalServer({
            actions,
            name: `Creating profile for ${userAccount}`,
            space: spaceAddress,
            // @TODO: Use storage client configured by environment
            storageClient: new StorageClient(Environment.options.production.ipfs),
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
      })
    );

    // @TODO: Batch?
    // Configure roles in proxy contract
    for (const role of ROLES) {
      yield* unwrap(
        Effect.tryPromise({
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
        })
      );
    }

    // @TODO Batch?
    // Renounce deployer roles in proxy contract
    for (const role of ROLES) {
      yield* unwrap(
        Effect.tryPromise({
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
        })
      );
    }
  });

  return createProfileEntityEffect;
}

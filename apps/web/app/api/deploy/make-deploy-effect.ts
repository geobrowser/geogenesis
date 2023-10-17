import { SpaceArtifact } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
// import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import { Effect } from 'effect';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonMumbai } from 'viem/chains';

import { ADMIN_ROLE_BINARY, EDITOR_CONTROLLER_ROLE_BINARY, EDITOR_ROLE_BINARY } from '~/core/constants';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { CreateTripleAction, OmitStrict, Triple } from '~/core/types';
import { slog } from '~/core/utils/utils';

import { makeProposalServer } from './make-proposal-server';

class ProxyBeaconInitializeFailedError extends Error {
  readonly _tag = 'ProxyBeaconInitializeFailedError';
}

class ProxyBeaconConfigureRolesFailedError extends Error {
  readonly _tag = 'ProxyBeaconConfigureRolesFailedError';
}

class ProxyBeaconDeploymentFailedError extends Error {
  readonly _tag = 'ProxyBeaconDeploymentFailedError';
}

class SpaceProxyContractAddressNullError extends Error {
  readonly _tag = 'SpaceProxyContractAddressNullError';
}

class GrantRoleError extends Error {
  readonly _tag = 'GrantAdminRole';
}

class RenounceRoleError extends Error {
  readonly _tag = 'GrantAdminRole';
}

class CreateProfileGeoEntityFailedError extends Error {
  readonly _tag = 'CreateProfileGeoEntityFailedError';
}

class AddToSpaceRegistryError extends Error {
  readonly _tag = 'AddToSpaceRegistryError';
}

interface UserConfig {
  account: `0x${string}`;
  username: string | null;
  avatarUri: string | null;
}

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

export function makeDeployEffect(requestId: string, { account: userAccount, username, avatarUri }: UserConfig) {
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

  /**
   * Geo's Space contracts are upgradeable using the Upgradeable Beacon pattern.
   *
   * A Beacon contract stores the implementation for a set of upgradeable contracts.
   * Deploying a new instance of a contract using the Beacon pattern will create a
   * Beacon Proxy which points to the Beacon contract. The Beacon Proxy will then
   * delegate all calls to the implementation contract stored in the Beacon contract.
   *
   * We have already deployed the implementation contract and the Beacon contract.
   *
   * ----------------    ----------    ---------------------------
   *   Beacon Proxy   ->   Beacon   ->   Implementation Contract    <--- Calls are delegated to this contract
   * ----------------    ----------    ---------------------------
   *
   * When a user makes a new profile there are several steps we need to complete
   * to register their profile and set up their space.
   */
  // Deploy proxy contract
  const deploymentEffect = Effect.gen(function* (unwrap) {
    const deployProxyEffect = yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          const proxyTxHash = await client.deployContract({
            abi: BeaconProxy.abi,
            bytecode: BeaconProxy.bytecode as `0x${string}`,
            // We are deploying a permissioned space to a permissionless registry.
            // Make sure we're pointing to the correct beacon.
            args: [SYSTEM_IDS.PERMISSIONED_SPACE_BEACON_ADDRESS, ''],
            account,
          });
          slog({ requestId, message: `Space proxy hash: ${proxyTxHash}`, account: userAccount });

          const proxyDeployTxReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyTxHash });
          slog({
            requestId,
            message: `Space proxy contract deployed at: ${proxyDeployTxReceipt.contractAddress}`,
            account: userAccount,
          });

          return proxyDeployTxReceipt;
        },
        catch: error => {
          slog({
            level: 'error',
            requestId,
            message: `Space proxy deployment failed: ${(error as Error).message}`,
            account: userAccount,
          });
          return new ProxyBeaconDeploymentFailedError();
        },
      })
    );

    if (deployProxyEffect.contractAddress === null) {
      return yield* unwrap(Effect.fail(new SpaceProxyContractAddressNullError()));
    }

    // Initialize proxy contract
    yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          const simulateInitializeResult = await publicClient.simulateContract({
            abi: SpaceArtifact.abi,
            address: deployProxyEffect.contractAddress as `0x${string}`,
            functionName: 'initialize',
            account,
          });

          const simulateInitializeHash = await client.writeContract(simulateInitializeResult.request);
          slog({ requestId, message: `Initialize hash: ${simulateInitializeHash}`, account: userAccount });

          const initializeTxResult = await publicClient.waitForTransactionReceipt({ hash: simulateInitializeHash });
          slog({
            requestId,
            message: `Initialize contract for ${deployProxyEffect.contractAddress}: ${initializeTxResult.transactionHash}`,
            account: userAccount,
          });

          return initializeTxResult;
        },
        catch: error => {
          slog({
            level: 'error',
            requestId,
            message: `Space contract initialization failed: ${(error as Error).message}`,
            account: userAccount,
          });
          return new ProxyBeaconInitializeFailedError();
        },
      })
    );

    // Add the new space to the permissionless space registry
    yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          const spaceAddressTripleWithoutId: OmitStrict<Triple, 'id'> = {
            entityId: ID.createEntityId(),
            entityName: `${username}'s Space`,
            attributeId: SYSTEM_IDS.SPACE,
            attributeName: 'Space',
            space: SYSTEM_IDS.PERMISSIONLESS_SPACE_REGISTRY_ADDRESS,
            value: {
              type: 'string',
              value: deployProxyEffect.contractAddress as string,
              id: ID.createValueId(),
            },
          };

          slog({
            requestId,
            message: `Adding space ${deployProxyEffect.contractAddress} for ${userAccount} to space registry at ${SYSTEM_IDS.PERMISSIONLESS_SPACE_REGISTRY_ADDRESS}`,
            account: userAccount,
          });

          const proposalEffect = await makeProposalServer({
            actions: [
              {
                type: 'createTriple',
                id: ID.createTripleId(spaceAddressTripleWithoutId),
                ...spaceAddressTripleWithoutId,
              },
            ],
            name: `Adding space ${deployProxyEffect.contractAddress} for ${userAccount} to space registry`,
            space: SYSTEM_IDS.PERMISSIONLESS_SPACE_REGISTRY_ADDRESS,
            // @TODO: Use storage client configured by environment
            storageClient: new StorageClient(Environment.options.production.ipfs),
            account,
            wallet: client,
            publicClient,
          });

          await Effect.runPromise(proposalEffect);

          slog({
            requestId,
            message: `Successfully added space ${deployProxyEffect.contractAddress} to space registry`,
            account: userAccount,
          });
        },
        catch: error => {
          slog({
            level: 'error',
            requestId,
            message: `Adding space ${deployProxyEffect.contractAddress} to space registry failed: ${
              (error as Error).message
            }`,
            account: userAccount,
          });
          return new AddToSpaceRegistryError();
        },
      })
    );

    // Configure roles in proxy contract. We need to configure the roles after adding to the registry.
    // This is because the indexer will not pick up events that happen before the indexer starts indexing
    // a dynamic data source.
    yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          const simulateConfigureRolesResult = await publicClient.simulateContract({
            abi: SpaceArtifact.abi,
            address: deployProxyEffect.contractAddress as `0x${string}`,
            functionName: 'configureRoles',
            account,
          });

          const configureRolesSimulateHash = await client.writeContract(simulateConfigureRolesResult.request);
          slog({ requestId, message: `Configure roles hash: ${configureRolesSimulateHash}`, account: userAccount });

          const configureRolesTxResult = await publicClient.waitForTransactionReceipt({
            hash: configureRolesSimulateHash,
          });
          slog({
            requestId,
            message: `Configure roles for ${deployProxyEffect.contractAddress}: ${configureRolesTxResult.transactionHash}`,
            account: userAccount,
          });

          return configureRolesTxResult;
        },
        catch: error => {
          slog({
            level: 'error',
            requestId,
            message: `Space contract role configuration failed: ${(error as Error).message}`,
            account: userAccount,
          });
          return new ProxyBeaconConfigureRolesFailedError();
        },
      })
    );

    // Add geo profile entity to new space
    yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          const actions: CreateTripleAction[] = [];
          const entityId = ID.createEntityId();

          if (username) {
            const nameTripleWithoutId: OmitStrict<Triple, 'id'> = {
              entityId,
              entityName: username ?? '',
              attributeId: SYSTEM_IDS.NAME,
              attributeName: 'Name',
              space: deployProxyEffect.contractAddress as string,
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
              entityId,
              entityName: username ?? '',
              attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
              attributeName: 'Avatar',
              space: deployProxyEffect.contractAddress as string,
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
            entityId,
            entityName: username ?? '',
            space: deployProxyEffect.contractAddress as string,
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

          slog({
            requestId,
            message: `Adding profile to space ${deployProxyEffect.contractAddress}`,
            account: userAccount,
          });

          const proposalEffect = await makeProposalServer({
            actions,
            name: `Creating profile for ${userAccount}`,
            space: deployProxyEffect.contractAddress as string,
            // @TODO: Use storage client configured by environment
            storageClient: new StorageClient(Environment.options.production.ipfs),
            account,
            wallet: client,
            publicClient,
          });

          await Effect.runPromise(proposalEffect);

          slog({
            requestId,
            message: `Successfully added profile to space ${deployProxyEffect.contractAddress}`,
            account: userAccount,
          });
        },
        catch: error => {
          slog({
            level: 'error',
            requestId,
            message: `Creating Geo entity Profile in space address ${deployProxyEffect.contractAddress} failed: ${
              (error as Error).message
            }`,
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
              address: deployProxyEffect.contractAddress as `0x${string}`,
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
              message: `Granted ${role.role} role for ${deployProxyEffect.contractAddress}: ${grantRoleTxHash.transactionHash}`,
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
              address: deployProxyEffect.contractAddress as `0x${string}`,
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
              message: `Renounced ${role.role} role for Geo deployer ${deployProxyEffect.contractAddress}: ${renounceRoleTxResult.transactionHash}`,
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

    return deployProxyEffect;
  });

  return deploymentEffect;
}

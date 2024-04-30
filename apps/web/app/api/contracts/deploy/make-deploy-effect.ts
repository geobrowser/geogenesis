import { SpaceArtifact } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

import { slog } from '~/core/utils/utils';

import { geoAccount, publicClient, walletClient } from '../../client';

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

interface UserConfig {
  account: `0x${string}`;
}

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
export function makeDeployEffect(requestId: string, { account: userAccount }: UserConfig) {
  // Deploy the proxy contract representing the user's space.
  const deployEffect = Effect.tryPromise({
    try: async () => {
      const proxyTxHash = await walletClient.deployContract({
        abi: BeaconProxy.abi,
        bytecode: BeaconProxy.bytecode as `0x${string}`,
        // We are deploying a permissioned space to a permissionless registry.
        // Make sure we're pointing to the correct beacon to represent the
        // implementation of the personal space and not the implementation
        // of the registry.
        args: [SYSTEM_IDS.PERMISSIONED_SPACE_BEACON_ADDRESS, ''],
        account: geoAccount,
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
  });

  // Space contracts need to be initialized after they are deployed.
  const createInitializeEffect = (contractAddress: `0x${string}`) =>
    Effect.tryPromise({
      try: async () => {
        const simulateInitializeResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: contractAddress as `0x${string}`,
          functionName: 'initialize',
          account: geoAccount,
        });

        const simulateInitializeHash = await walletClient.writeContract(simulateInitializeResult.request);
        slog({ requestId, message: `Initialize hash: ${simulateInitializeHash}`, account: userAccount });

        const initializeTxResult = await publicClient.waitForTransactionReceipt({ hash: simulateInitializeHash });
        slog({
          requestId,
          message: `Initialize contract for ${contractAddress}: ${initializeTxResult.transactionHash}`,
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
    });

  // Logic for configuring roles in the proxy contract. We need to configure the roles after adding
  // to the registry. This is because the indexer will not pick up events that happen before the indexer starts
  // indexing a dynamic data source. `configureRoles` emits events for configuring the initial roles for the space
  // so we need to make sure the indexer starts indexing this space _after_ the role events are emitted.
  //
  // @TODO: With substreams this shouldn't matter since substreams map every block, not just a specific address
  // at a specific block number, so this specific ordering shouldn't matter.
  const createConfigureRolesEffect = (contractAddress: `0x${string}`) =>
    Effect.tryPromise({
      try: async () => {
        const simulateConfigureRolesResult = await publicClient.simulateContract({
          abi: SpaceArtifact.abi,
          address: contractAddress as `0x${string}`,
          functionName: 'configureRoles',
          account: geoAccount,
        });

        const configureRolesSimulateHash = await walletClient.writeContract(simulateConfigureRolesResult.request);
        slog({ requestId, message: `Configure roles hash: ${configureRolesSimulateHash}`, account: userAccount });

        const configureRolesTxResult = await publicClient.waitForTransactionReceipt({
          hash: configureRolesSimulateHash,
        });
        slog({
          requestId,
          message: `Configure roles for ${contractAddress}: ${configureRolesTxResult.transactionHash}`,
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
    });

  // Execute all the lazily created functions for executing the deployment logic.
  // 1. Deploy the proxy contract
  // 2. Initialize the proxy contract
  // 3. Add the proxy contract to the permissionless space registry
  // 4. Configure roles in the proxy contract
  //
  // We retry each step with an exponential backoff in case of failure, especially as the
  // RPC nodes we use have rate-limiting that is hard to predict.
  const deploymentEffect = Effect.gen(function* (unwrap) {
    // Deploy proxy contract
    const deployProxyEffect = Effect.retry(deployEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered));
    const deployProxyResult = yield* unwrap(deployProxyEffect);

    if (deployProxyResult.contractAddress === null) {
      return yield* unwrap(Effect.fail(new SpaceProxyContractAddressNullError()));
    }

    // Initialize proxy contract
    const initializeEffect = Effect.retry(
      createInitializeEffect(deployProxyResult.contractAddress),
      Schedule.exponential('100 millis').pipe(Schedule.jittered)
    );
    yield* unwrap(initializeEffect);

    // Configure roles in proxy contract. We need to configure the roles after adding to the registry.
    const configureRolesEffect = Effect.retry(
      createConfigureRolesEffect(deployProxyResult.contractAddress),
      Schedule.exponential('100 millis').pipe(Schedule.jittered)
    );
    yield* unwrap(configureRolesEffect);

    return deployProxyResult;
  });

  return deploymentEffect;
}

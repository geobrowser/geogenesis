import { SpaceArtifact } from '@geogenesis/contracts';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
// import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import { Effect } from 'effect';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonMumbai } from 'viem/chains';

import { Environment } from '~/core/environment';
import { slog } from '~/core/utils/utils';

const MUMBAI_BEACON_ADDRESS = '0xf7239cb6d1ac800f2025a2571ce32bde190059cb';

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

export function makeDeployEffect(requestId: string, userAccount: `0x${string}`) {
  /**
   * 1. ~~Get beacon contract from beacon address~~
   * 2. ~~Deploy proxy contract pointing to beacon contract~~
   *     https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/7fd8a3a9f81839482d91af1df99f0b97966ee74a/packages/plugin-hardhat/test/import.js#L117
   * 3. ~~Configure roles (will we still need this?)~~
   * 4. Deploy governance contracts (how does this work?)
   * 5. Call `addSubspace` on permissionless registry
   * 6. Add user profile to new space
   * 7. Make user admin/editor/editorController (will we need this with governance?)
   * 7.5. This should be indexed by the Person indexer into a Person Id <-> Space Id mapping
   * 8. Remove deployer from admin/editor/editorController
   */
  const account = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

  const client = createWalletClient({
    chain: polygonMumbai,
    // transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
    transport: http(Environment.options.testnet.rpc, { batch: true }),
  });

  const publicClient = createPublicClient({
    chain: polygonMumbai,
    // transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
    transport: http(Environment.options.testnet.rpc, { batch: true }),
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
   */
  // Proxy deployment
  const deploymentEffect = Effect.gen(function* (unwrap) {
    const deployProxyEffect = yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          const proxyTxHash = await client.deployContract({
            abi: BeaconProxy.abi,
            bytecode: BeaconProxy.bytecode as `0x${string}`,
            args: [MUMBAI_BEACON_ADDRESS, ''],
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
            message: `Initialize contract for ${deployProxyEffect.contractAddress}: ${initializeTxResult}`,
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

    yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          // Configure roles in proxy contract
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
            message: `Configure roles for ${deployProxyEffect.contractAddress}: ${configureRolesTxResult}`,
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

    // @TODO:
    // - grant all roles to userAddress
    // - renounce role for deployer (we might not want to do this until we migrate to the new governance contracts)
    // - add user profile to space
    // - add space to registry
    // - map space to profile and wallet address (no idea how to do this)

    return deployProxyEffect;
  });

  return deploymentEffect;
}

import { SpaceArtifact } from '@geogenesis/contracts';
import BeaconProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol/BeaconProxy.json';
// import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonMumbai } from 'viem/chains';

import { Environment } from '~/core/environment';

const MUMBAI_BEACON_ADDRESS = '0xe5d72fc8c886b043f297319094de770647965a17';
// const MUMBAI_IMPL_ADDRESS = '0x973225e76a9f22ec79131d6716531a3b57dd60b6';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  console.log('searchParams + userAddress', searchParams.get('userAddress'));

  if (searchParams.get('userAddress') === null) {
    // @TODO: Correct error handling
    return new Response('Missing user address', { status: 400 });
  }

  /**
   * 1. Get beacon contract from beacon address
   * 2. Deploy proxy contract pointing to beacon contract
   *     https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/7fd8a3a9f81839482d91af1df99f0b97966ee74a/packages/plugin-hardhat/test/import.js#L117
   * 3. Configure roles (will we still need this?)
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
    transport: http(Environment.options.testnet.rpc),
  });

  const publicClient = createPublicClient({
    chain: polygonMumbai,
    // transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
    transport: http(Environment.options.testnet.rpc),
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

  // Beacon deployment
  // @TODO: Remove beacon deployment and use existing beacon
  // const beaconHash = await client.deployContract({
  //   abi: UpgradeableBeacon.abi,
  //   bytecode: UpgradeableBeacon.bytecode as `0x${string}`,
  //   args: [MUMBAI_IMPL_ADDRESS],
  //   account,
  // });
  // console.log('Space beacon hash', beaconHash);

  // const beaconDeployTxReceipt = await publicClient.waitForTransactionReceipt({ hash: beaconHash });
  // console.log('Space beacon contract deployed at: ', beaconDeployTxReceipt.contractAddress);

  // Proxy deployment
  const proxyTxHash = await client.deployContract({
    abi: BeaconProxy.abi,
    bytecode: BeaconProxy.bytecode as `0x${string}`,
    args: [MUMBAI_BEACON_ADDRESS, ''],
    account,
  });
  console.log('Space proxy hash', proxyTxHash);

  const proxyDeployTxReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyTxHash });
  console.log('Space proxy contract deployed at: ', proxyDeployTxReceipt.contractAddress);

  if (proxyDeployTxReceipt.contractAddress !== null) {
    // Initialize proxy contract
    const simulateInitializeResult = await publicClient.simulateContract({
      abi: SpaceArtifact.abi,
      address: proxyDeployTxReceipt.contractAddress as `0x${string}`,
      functionName: 'initialize',
      account,
    });

    const simulateInitializeHash = await client.writeContract(simulateInitializeResult.request);
    console.log(`Initialize hash: ${simulateInitializeHash}`);

    const initializeTxResult = await publicClient.waitForTransactionReceipt({ hash: simulateInitializeHash });
    console.log(`Initialize contract for ${proxyDeployTxReceipt.contractAddress}: ${initializeTxResult}`);

    // Configure roles in proxy contract
    const simulateConfigureRolesResult = await publicClient.simulateContract({
      abi: SpaceArtifact.abi,
      address: proxyDeployTxReceipt.contractAddress as `0x${string}`,
      functionName: 'configureRoles',
      account,
    });

    const configureRolesSimulateHash = await client.writeContract(simulateConfigureRolesResult.request);
    console.log(`Configure roles hash: ${simulateInitializeHash}`);

    const configureRolesTxResult = await publicClient.waitForTransactionReceipt({ hash: configureRolesSimulateHash });
    console.log(`Initialize contract for ${proxyDeployTxReceipt.contractAddress}: ${configureRolesTxResult}`);
  }

  // const idk = getContract({
  //   abi: SpaceArtifact.abi,
  //   address: '0xe2fc648dd2feac6663f142bb40d850ca9267d450',
  //   publicClient,
  //   walletClient: client,
  // });

  // const idk2 = await idk.read.owner();
  // console.log('owner', idk2);

  return; //
}

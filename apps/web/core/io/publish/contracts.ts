import { SpaceArtifact } from '@geogenesis/contracts';

import { WalletClient } from 'wagmi';
import { getContract, waitForTransaction } from 'wagmi/actions';

class SpaceDeploymentError extends Error {
  readonly _tag = 'SpaceDeploymentError';
}

export async function deploySpaceContract(client: WalletClient) {
  // 1. Get space beacon
  // 2. How do we deploy a proxy and the space ???
  //    https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/// 7fd8a3a9f81839482d91af1df99f0b97966ee74a/packages/plugin-hardhat/test/import.js#L117
  // 3. Configure roles (?)

  // @TODO: Ensure that we are using the beacon proxy
  // @TODO: Use Effect
  // const hash = await client.deployContract({
  //   abi: SpaceArtifact.abi,
  //   bytecode: SpaceArtifact.bytecode as `0x${string}`,
  //   args: [],
  // });

  await fetch(`/api/deploy?userAddress=${client.account.address}`);

  // const receipt = await waitForTransaction({ hash });
  // console.log('Space contract deployed at: ', receipt.contractAddress);

  return; //
}

export function deployGovernanceContracts() {
  return; //
}

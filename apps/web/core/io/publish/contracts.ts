import { WalletClient } from 'wagmi';

class SpaceDeploymentError extends Error {
  readonly _tag = 'SpaceDeploymentError';
}

export async function deploySpaceContract(client: WalletClient) {
  // @TODO: Error and success handling with Effect
  await fetch(`/api/deploy?userAddress=${client.account.address}`);
  return; //
}

export function deployGovernanceContracts() {
  return; //
}

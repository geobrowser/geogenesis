import { WalletClient } from 'wagmi';

export async function deploySpaceContract(client: WalletClient) {
  // @TODO: Error and success handling with Effect
  await fetch(`/api/deploy?userAddress=${client.account.address}&username=bananabob`);
  return; //
}

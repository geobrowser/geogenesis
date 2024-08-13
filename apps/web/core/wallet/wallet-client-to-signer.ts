import { providers } from 'ethers';
import { WalletClient } from 'viem';

export function walletClientToSigner(walletClient: WalletClient) {
  const { account, chain, transport } = walletClient;

  if (!chain) return;

  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new providers.Web3Provider(transport, network);
  const signer = provider.getSigner(account?.address);
  return signer;
}

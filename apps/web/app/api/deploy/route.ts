import { SpaceArtifact } from '@geogenesis/contracts';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

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
   *     https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/// 7fd8a3a9f81839482d91af1df99f0b97966ee74a/packages/plugin-hardhat/test/import.js#L117
   * 3. Deploy governance contracts (how does this work?)
   * 4. Add user profile to new space
   * 5. Make user admin/editor/editorController (will we need this with governance?)
   * 6. Remove deployer from admin/editor/editorController
   */
  const account = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

  const client = createWalletClient({
    chain: polygon,
    account,
    transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
  });

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.ALCHEMY_ENDPOINT, { batch: true }),
  });

  const hash = await client.deployContract({
    abi: SpaceArtifact.abi,
    bytecode: SpaceArtifact.bytecode as `0x${string}`,
  });

  console.log('hash', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Space contract deployed at: ', receipt.contractAddress);

  return; //
}

import {ethers} from 'ethers';
import IPFS from 'ipfs-http-client';

export async function uploadToIPFS(
  content: string,
  testing: boolean = true
): Promise<string> {
  const client = IPFS.create({
    url: testing
      ? 'https://test.ipfs.aragon.network/api/v0'
      : 'https://prod.ipfs.aragon.network/api/v0',
    headers: {
      'X-API-KEY': 'b477RhECf8s8sdM7XrkLBs2wHc4kCMwpbcFC55Kt',
    },
  });

  const result = await client.add(content);
  await client.pin.add(result.cid);
  return result.path || result.cid.toString();
}

export function toHex(input: string): string {
  return ethers.utils.hexlify(ethers.utils.toUtf8Bytes(input));
}

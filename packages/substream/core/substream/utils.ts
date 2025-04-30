import { Base58, getChecksumAddress } from '@graphprotocol/grc-20';
import { createHash } from 'crypto';
import { v4 } from 'uuid';

/**
 * A space's id is derived from the contract address of the DAO and the network the DAO is deployed to.
 * Users can import or fork a space from any network and import the contents of the original space into
 * the new one that they're creating.
 */
export function deriveSpaceId({ network, address }: { network: string; address: string }) {
  return createIdFromUniqueString(`${network}:${getChecksumAddress(address)}`);
}

export function createIdFromUniqueString(text: string) {
  const hashed = createHash('md5').update(text).digest('hex');
  const bytes = hexToBytesArray(hashed);
  const uuid = v4({ random: bytes });
  return Base58.encodeBase58(uuid.split('-').join(''));
}

function hexToBytesArray(hex: string) {
  const bytes: number[] = [];

  for (let character = 0; character < hex.length; character += 2) {
    bytes.push(parseInt(hex.slice(character, character + 2), 16));
  }

  return bytes;
}

type DeriveProposalIdArgs = {
  pluginAddress: string;
  onchainProposalId: string;
};

export function deriveProposalId(args: DeriveProposalIdArgs) {
  return createIdFromUniqueString(`${getChecksumAddress(args.pluginAddress)}:${args.onchainProposalId}`);
}

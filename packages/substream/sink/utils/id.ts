import { Base58, getChecksumAddress } from '@graphprotocol/grc-20';
import { md5 } from '@noble/hashes/legacy';
import { v4 } from 'uuid';

export function createMergedVersionId(mergedVersionIds: string[]) {
  return createIdFromUniqueString(mergedVersionIds.join(','));
}

export function createVersionId({ proposalId, entityId }: { proposalId: string; entityId: string }): string {
  return createIdFromUniqueString(`${proposalId}:${entityId}`);
}

/**
 * A space's id is derived from the contract address of the DAO and the network the DAO is deployed to.
 * Users can import or fork a space from any network and import the contents of the original space into
 * the new one that they're creating.
 */
export function deriveSpaceId({ network, address }: { network: string; address: string }) {
  return createIdFromUniqueString(`${network}:${getChecksumAddress(address)}`);
}

function createIdFromUniqueString(text: string) {
  const encoded = new TextEncoder().encode(text);
  const hashed = md5(encoded);
  const uuid = v4({ random: hashed });
  return Base58.encodeBase58(uuid.split('-').join(''));
}

type DeriveProposalIdArgs = {
  pluginAddress: string;
  onchainProposalId: string;
};

export function deriveProposalId(args: DeriveProposalIdArgs) {
  return createIdFromUniqueString(`${getChecksumAddress(args.pluginAddress)}:${args.onchainProposalId}`);
}

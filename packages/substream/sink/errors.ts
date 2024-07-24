import { getChecksumAddress } from './utils/get-checksum-address';

export class SpaceWithPluginAddressNotFoundError extends Error {
  _tag: 'SpaceWithPluginAddressNotFoundError' = 'SpaceWithPluginAddressNotFoundError';
}

export class ProposalWithOnchainProposalIdAndSpaceIdNotFoundError extends Error {
  _tag: 'ProposalWithOnchainProposalIdAndSpaceIdNotFoundError' = 'ProposalWithOnchainProposalIdAndSpaceIdNotFoundError';
}

export class CouldNotWriteSpacesError extends Error {
  _tag: 'CouldNotWriteSpacesError' = 'CouldNotWriteSpacesError';
}

export class CouldNotWriteAccountsError extends Error {
  _tag: 'CouldNotWriteAccountsError' = 'CouldNotWriteAccountsError';
}

export class InvalidPluginAddressForDaoError extends Error {
  _tag: 'InvalidPluginAddressForDaoError' = 'InvalidPluginAddressForDaoError';
}

export function isInvalidPluginForDao(
  pluginAddress: string,
  space: { main_voting_plugin_address: string | null; personal_space_admin_plugin_address: string | null }
) {
  const hasMatchingMainVotingPlugin = space.main_voting_plugin_address === getChecksumAddress(pluginAddress);
  const hasMatchingPersonalSpaceAdminPlugin =
    space.personal_space_admin_plugin_address === getChecksumAddress(pluginAddress);

  return !hasMatchingMainVotingPlugin && !hasMatchingPersonalSpaceAdminPlugin;
}

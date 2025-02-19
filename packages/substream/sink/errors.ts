import { getChecksumAddress } from '@graphprotocol/grc-20';
import { Data } from 'effect';

export class CouldNotWriteSpacesError extends Data.TaggedError('CouldNotWriteSpacesError')<{
  message: string;
}> {}

export class SpaceWithPluginAddressNotFoundError extends Error {
  readonly _tag: 'SpaceWithPluginAddressNotFoundError' = 'SpaceWithPluginAddressNotFoundError';
}

export class ProposalWithOnchainProposalIdAndSpaceIdNotFoundError extends Error {
  _tag = 'ProposalWithOnchainProposalIdAndSpaceIdNotFoundError';
}

export class CouldNotWriteAccountsError extends Error {
  _tag = 'CouldNotWriteAccountsError';
}

export class InvalidPluginAddressForDaoError extends Error {
  _tag = 'InvalidPluginAddressForDaoError';
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

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

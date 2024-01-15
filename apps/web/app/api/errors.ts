export class GrantRoleError extends Error {
  readonly _tag = 'GrantAdminRole';
}

export class RenounceRoleError extends Error {
  readonly _tag = 'RenounceRoleError';
}

export class CreateProfileGeoEntityFailedError extends Error {
  readonly _tag = 'CreateProfileGeoEntityFailedError';
}

export class CreateSpaceEntitiesFailedError extends Error {
  readonly _tag = 'CreateSpaceEntitiesFailedError';
}

export class ProxyBeaconInitializeFailedError extends Error {
  readonly _tag = 'ProxyBeaconInitializeFailedError';
}

export class ProxyBeaconConfigureRolesFailedError extends Error {
  readonly _tag = 'ProxyBeaconConfigureRolesFailedError';
}

export class ProxyBeaconDeploymentFailedError extends Error {
  readonly _tag = 'ProxyBeaconDeploymentFailedError';
}

export class SpaceProxyContractAddressNullError extends Error {
  readonly _tag = 'SpaceProxyContractAddressNullError';
}

export class AddToSpaceRegistryError extends Error {
  readonly _tag = 'AddToSpaceRegistryError';
}

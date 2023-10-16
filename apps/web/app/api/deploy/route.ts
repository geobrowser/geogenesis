// import UpgradeableBeacon from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { slog } from '~/core/utils/utils';

import { makeDeployEffect } from './make-deploy-effect';

export const maxDuration = 180;

export async function GET(request: Request) {
  const requestId = uuid();
  const { searchParams } = new URL(request.url);

  const userAccount = searchParams.get('userAddress') as `0x${string}` | null;

  if (userAccount === null) {
    return new Response('Missing user address', { status: 400 });
  }

  const username = searchParams.get('username');
  const avatarUri = searchParams.get('avatarUri');

  slog({
    requestId,
    account: userAccount,
    message: `Setting up profile and contracts for user: ${{ userAccount, username, avatarUri }}`,
  });

  const deployment = makeDeployEffect(requestId, { account: userAccount, username, avatarUri });
  const maybeDeployment = await Effect.runPromise(Effect.either(deployment));

  if (Either.isLeft(maybeDeployment)) {
    const error = maybeDeployment.left;

    switch (error._tag) {
      case 'ProxyBeaconDeploymentFailedError':
        return new Response('Could not deploy space contract. Please try again.', {
          status: 500,
          statusText: error.message,
        });
      case 'SpaceProxyContractAddressNullError':
        slog({
          level: 'error',
          requestId,
          message: `Space proxy deployment failed for unknown reason`,
          account: userAccount,
        });
        return new Response('Could not deploy space contract. Please try again.', {
          status: 500,
          statusText: 'Unknown error',
        });
      case 'ProxyBeaconInitializeFailedError':
        return new Response(`Could not initialize space contract for user: ${userAccount}`, {
          status: 500,
          statusText: error.message,
        });
      case 'ProxyBeaconConfigureRolesFailedError':
        return new Response(`Could not configure contract roles for user: ${userAccount}`, {
          status: 500,
          statusText: error.message,
        });
      case 'CreateProfileGeoEntityFailedError':
        return new Response(`Could not create profile Geo Entity for user: ${userAccount}`, {
          status: 500,
          statusText: error.message,
        });
      case 'AddToSpaceRegistryError':
        return new Response(`Could not add user to space registry for user: ${userAccount}`, {
          status: 500,
          statusText: error.message,
        });
      case 'GrantAdminRole':
        return new Response(`Could not grant admin role for user: ${userAccount}`, {
          status: 500,
          statusText: error.message,
        });
      default:
        return new Response('Could not deploy space contract. Please try again.', {
          status: 500,
          statusText: 'Unknown error',
        });
    }
  }

  const proxyDeployTxReceipt = maybeDeployment.right;

  slog({
    requestId,
    message: `Space deployment and Geo registration successful: ${proxyDeployTxReceipt.contractAddress}`,
    account: userAccount,
  });

  // @TODO: Anything else we should return here?
  return new Response(proxyDeployTxReceipt.contractAddress, { status: 200 });
}

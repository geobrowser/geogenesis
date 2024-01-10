import { Schedule } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';
import { getAddress } from 'viem';

import { SpaceType } from '~/core/types';
import { slog } from '~/core/utils/utils';

import { SpaceProxyContractAddressNullError } from '../../errors';
import { makeCreateEntitiesEffect } from './make-create-entities-effect';
import { makeDeploySpaceEffect } from './make-deploy-space-effect';
import { makeTransferRolesEffect } from './make-transfer-roles-effect';

export const maxDuration = 180;

export async function GET(request: Request) {
  const requestId = uuid();
  const { searchParams } = new URL(request.url);

  const userAccount = searchParams.get('userAddress') as `0x${string}` | null;

  if (userAccount === null) {
    return new Response(
      JSON.stringify({
        error: 'Missing user address',
        reason: "A user's wallet address is required to set permissions on the deployed space.",
      }),
      {
        status: 400,
      }
    );
  }

  const spaceName = searchParams.get('spaceName');
  const spaceAvatarUri = searchParams.get('spaceAvatarUri');
  const spaceType = searchParams.get('type') ?? 'default';

  if (!spaceName) {
    return new Response(JSON.stringify({ error: 'Missing space name', reason: 'Missing space name' }), {
      status: 400,
      statusText: 'Missing space name',
    });
  }

  slog({
    requestId,
    account: userAccount,
    message: `Setting up contracts for new space created by user: ${{ userAccount }}`,
  });

  /**
   * Deploying a new space consists of three steps:
   * 1. Deploying the contracts and calling necessary configuration methods
   * 2. Creating the Geo entities to represent the type of space being created, either Default, Company, or Nonprofit
   * 3. Transferring the deployer permissions/roles to the user who created the space and removing the same roles
   *
   * The entire process returns the transaction receipt of the space deployment. We later use the deployed contract
   * address and return it so the client is able to navigate to the newly created space.
   */
  const deploymentAndConfigurationEffect = Effect.gen(function* (_) {
    const deployment = makeDeploySpaceEffect(requestId, { account: userAccount });
    const maybeDeployment = yield* _(
      Effect.retry(deployment, Schedule.exponential('1 seconds').pipe(Schedule.jittered))
    );

    // This _should_ be handled internally by the deployment effect already, but typescript
    // doesn't know that.
    if (!maybeDeployment.contractAddress) {
      return yield* _(Effect.fail(new SpaceProxyContractAddressNullError()));
    }

    const createEntities = makeCreateEntitiesEffect(requestId, {
      spaceAddress: maybeDeployment.contractAddress,
      spaceAvatarUri,
      spaceName,
      type: spaceType as SpaceType,
    });

    yield* _(Effect.retry(createEntities, Schedule.exponential('1 seconds').pipe(Schedule.jittered)));

    const transferRolesEffect = makeTransferRolesEffect(requestId, {
      spaceAddress: maybeDeployment.contractAddress,
      userAccount,
    });

    yield* _(Effect.retry(transferRolesEffect, Schedule.exponential('1 seconds').pipe(Schedule.jittered)));

    return maybeDeployment;
  });

  const maybeDeployment = await Effect.runPromise(Effect.either(deploymentAndConfigurationEffect));

  if (Either.isLeft(maybeDeployment)) {
    const error = maybeDeployment.left;

    switch (error._tag) {
      case 'ProxyBeaconDeploymentFailedError':
        return new Response(JSON.stringify({ error: 'Deployment error', reason: 'Proxy Beacon failed to deploy' }), {
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
        return new Response(JSON.stringify({ error: 'Deployment error', reason: 'Deployed space has null address' }), {
          status: 500,
          statusText: 'Unknown error',
        });
      case 'ProxyBeaconInitializeFailedError':
        return new Response(
          JSON.stringify({
            error: 'Contract could not be initialized',
            reason: `Could not initialize space contract for user: ${userAccount}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'ProxyBeaconConfigureRolesFailedError':
        return new Response(
          JSON.stringify({
            error: 'Contract could not be configured',
            reason: `Could not configure contract roles for user: ${userAccount}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'AddToSpaceRegistryError':
        return new Response(
          JSON.stringify({
            error: 'Could not add contract to space registry',
            reason: `Could not add space to space registry for user: ${userAccount}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'CreateSpaceEntitiesFailedError':
        return new Response(
          JSON.stringify({
            error: 'Could not create space entities',
            reason: `Could not create space entities for user: ${userAccount}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'GrantAdminRole':
        return new Response(
          JSON.stringify({
            error: 'Space configuration failed',
            reason: `Could not grant admin role for user: ${userAccount}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'RenounceRoleError':
        return new Response(
          JSON.stringify({
            error: 'Space configuration failed',
            reason: `Could not renounce deployer roles for deployer wallet`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      default:
        return new Response(
          JSON.stringify({
            error: 'Unable to deploy contract for unknown reasons',
            reason: 'Could not deploy space contract. Please try again.',
          }),
          {
            status: 500,
            statusText: 'Unknown error',
          }
        );
    }
  }

  const proxyDeployTxReceipt = maybeDeployment.right;

  slog({
    requestId,
    message: `Space deployment and configuration successful: ${proxyDeployTxReceipt.contractAddress}`,
    account: userAccount,
  });

  // We can safely cast with ! here since we know we're handling the case where the contract address is empty
  // in our deployment effects.
  //
  // Make sure we're returning the checksum'd address
  return new Response(JSON.stringify({ spaceAddress: getAddress(proxyDeployTxReceipt.contractAddress!) }), {
    status: 200,
  });
}

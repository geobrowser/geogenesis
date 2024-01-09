import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { getGeoPersonIdFromOnchainId, slog } from '~/core/utils/utils';

import { makeCompanyEffect } from './make-company-effect';

export const maxDuration = 180;

export async function GET(request: Request) {
  const requestId = uuid();
  const { searchParams } = new URL(request.url);

  const userAddress = searchParams.get('userAddress') as `0x${string}` | null;

  if (userAddress === null) {
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

  const username = searchParams.get('username');
  const avatarUri = searchParams.get('avatarUri');
  const spaceAddress = searchParams.get('spaceAddress');
  const profileId = searchParams.get('profileId');

  if (!spaceAddress) {
    return new Response(JSON.stringify({ error: 'Missing space address', reason: 'Missing space address' }), {
      status: 400,
      statusText: 'Missing space address',
    });
  }

  if (!userAddress) {
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

  if (!profileId) {
    return new Response(JSON.stringify({ error: 'Missing profile ID', reason: 'Missing profile ID' }), {
      status: 400,
    });
  }

  const geoEntityIdFromOnchainId = getGeoPersonIdFromOnchainId(userAddress, profileId);

  const createProfileEffect = await makeCompanyEffect(requestId, {
    account: userAddress as `0x${string}`,
    username,
    avatarUri,
    spaceAddress,
    profileId: geoEntityIdFromOnchainId,
  });

  const profileEffect = await Effect.runPromise(Effect.either(createProfileEffect));

  if (Either.isLeft(profileEffect)) {
    const error = profileEffect.left;

    switch (error._tag) {
      case 'CreateProfileGeoEntityFailedError':
        return new Response(
          JSON.stringify({
            error: 'Profile creation failed',
            reason: `Could not create profile for user: ${userAddress}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'GrantAdminRole':
        return new Response(
          JSON.stringify({
            error: 'Profile creation failed',
            reason: `Could not grant admin role for user: ${userAddress}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      case 'RenounceRoleError':
        return new Response(
          JSON.stringify({
            error: 'Profile creation failed',
            reason: `Could not renounce deployer roles for user: ${userAddress}`,
          }),
          {
            status: 500,
            statusText: error.message,
          }
        );
      default:
        return new Response(
          JSON.stringify({
            error: 'Unable to create profile for unknown reasons',
            reason: 'Could not create profile. Please try again.',
          }),
          {
            status: 500,
            statusText: 'Unknown error',
          }
        );
    }
  }

  slog({
    requestId,
    message: `Profile creation and role setup complete for space ${spaceAddress}. New entity id set up at ${geoEntityIdFromOnchainId}`,
    account: userAddress,
  });

  return new Response(JSON.stringify({ spaceAddress, entityId: geoEntityIdFromOnchainId }), { status: 200 });
}

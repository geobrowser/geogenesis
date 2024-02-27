import { SpaceType } from '~/core/types';

export async function deploySpaceContract({ account }: { account: string }): Promise<{ spaceAddress: `0x${string}` }> {
  const url = new URL(`/api/contracts/deploy?userAddress=${account}`, window.location.href);

  // @TODO: Error and success handling with Effect
  const spaceContractDeploymentResponse = await fetch(url);

  const createAndConfigureSpaceResponse = await fetch(url);

  if (!createAndConfigureSpaceResponse.ok || createAndConfigureSpaceResponse.status >= 400) {
    console.error(
      'Unable to create and configure space',
      createAndConfigureSpaceResponse.status,
      createAndConfigureSpaceResponse.statusText
    );
    throw new Error(`Unable to create and configure space: ${createAndConfigureSpaceResponse.statusText}`);
  }

  return await spaceContractDeploymentResponse.json();
}

export type AccountType = 'person' | 'company' | 'nonprofit';

export async function createProfileEntity({
  spaceAddress,
  profileId,
  account,
  username,
  avatarUri,
  accountType,
}: {
  spaceAddress: `0x${string}`;
  profileId: string;
  account: string;
  username: string | null;
  avatarUri: string | null;
  accountType: AccountType;
}): Promise<{ spaceAddress: `0x${string}`; entityId: string }> {
  const url = new URL(
    `/api/${accountType}/deploy?userAddress=${account}&spaceAddress=${spaceAddress}&profileId=${profileId}`,
    window.location.href
  );

  if (username) {
    url.searchParams.set('username', username);
  }

  if (avatarUri) {
    url.searchParams.set('avatarUri', avatarUri);
  }

  const createProfileResponse = await fetch(url);

  if (!createProfileResponse.ok || createProfileResponse.status >= 400) {
    console.error('Unable to create profile', createProfileResponse.status, createProfileResponse.statusText);
    throw new Error(`Unable to create profile: ${createProfileResponse.statusText}`);
  }

  return await createProfileResponse.json();
}

export async function createSpaceWithEntities({
  type,
  userAccount,
  spaceName,
  spaceAvatarUri,
}: {
  userAccount: string;
  spaceName: string | null;
  spaceAvatarUri: string | null;
  type: SpaceType;
}): Promise<{ spaceAddress: `0x${string}` }> {
  const url = new URL(`/api/space/deploy?userAddress=${userAccount}&type=${type}`, window.location.href);

  if (spaceName) {
    url.searchParams.set('spaceName', spaceName);
  }

  if (spaceAvatarUri) {
    url.searchParams.set('spaceAvatarUri', spaceAvatarUri);
  }

  const createSpaceEntitiesResponse = await fetch(url);

  if (!createSpaceEntitiesResponse.ok || createSpaceEntitiesResponse.status >= 400) {
    console.error(
      'Unable to create entities in space',
      createSpaceEntitiesResponse.status,
      createSpaceEntitiesResponse.statusText
    );
    throw new Error(`Unable to create entities in space: ${createSpaceEntitiesResponse.statusText}`);
  }

  return await createSpaceEntitiesResponse.json();
}

export async function deploySpaceContract({ account }: { account: string }): Promise<{ spaceAddress: `0x${string}` }> {
  const url = new URL(`/api/deploy/deploy?userAddress=${account}`, window.location.href);

  // @TODO: Error and success handling with Effect
  const spaceContractDeploymentResponse = await fetch(url);
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
}): Promise<{ spaceAddress: string; entityId: string }> {
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
  return await createProfileResponse.json();
}

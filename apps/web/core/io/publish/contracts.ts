export async function deploySpaceContract({
  account,
  username,
  avatarUri,
}: {
  account: string;
  username: string | null;
  avatarUri: string | null;
}): Promise<{ spaceAddress: `0x${string}` }> {
  const url = new URL(`/api/deploy?userAddress=${account}`, window.location.href);

  if (username) {
    url.searchParams.set('username', username);
  }

  if (avatarUri) {
    url.searchParams.set('avatarUri', avatarUri);
  }

  console.log('url', url);

  // @TODO: Error and success handling with Effect
  const idk = await fetch(url);
  return await idk.json();
}

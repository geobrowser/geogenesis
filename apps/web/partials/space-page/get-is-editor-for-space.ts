import { API } from '~/core/io';

export async function getIsEditorForSpace(spaceId: string, connectedAddress?: string): Promise<boolean> {
  const { space } = await API.space(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  console.log('connected address', {
    connectedAddress,
    admins: space.admins,
    editors: space.editors,
    isEditor: space.editors.includes(connectedAddress ?? ''),
  });

  return connectedAddress ? space.editors.includes(connectedAddress) : false;
}

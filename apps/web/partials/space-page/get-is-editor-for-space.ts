import { API } from '~/core/io';

export async function getIsEditorForSpace(spaceId: string, connectedAddress?: string): Promise<boolean> {
  const { space } = await API.space(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  return connectedAddress ? space.editors.includes(connectedAddress) : false;
}

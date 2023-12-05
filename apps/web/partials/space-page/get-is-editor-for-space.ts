import { API } from '~/core/io';

export async function getIsEditorForSpace(spaceId: string, connectedAddress?: string): Promise<boolean> {
  const { space } = await API.space(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // @HACK to get around incorrect checksum addresses in substream
  return connectedAddress ? space.editors.map(e => e.toLowerCase()).includes(connectedAddress?.toLowerCase()) : false;
}

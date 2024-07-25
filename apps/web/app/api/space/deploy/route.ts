import { v4 as uuid } from 'uuid';

import { SpaceType } from '~/core/types';
import { slog } from '~/core/utils/utils';

import { deploySpace } from './deploy';

export const maxDuration = 180;

export async function GET(request: Request) {
  const requestId = uuid();
  const url = new URL(request.url);
  const baseUrl = url.host;
  const protocol = url.protocol;

  const initialEditorAddress = url.searchParams.get('initialEditorAddress');
  const spaceName = url.searchParams.get('spaceName');
  const spaceAvatarUri = url.searchParams.get('spaceAvatarUri');
  const type = url.searchParams.get('type') as SpaceType | null;

  if (initialEditorAddress === null || spaceName === null || type === null) {
    slog({
      requestId,
      level: 'error',
      message: `Missing required parameters to deploy a space ${JSON.stringify({
        initialEditorAddress,
        spaceName,
        type,
      })}`,
    });

    return new Response(
      JSON.stringify({
        error: 'Missing required parameters',
        reason: 'A user account, space name, and space type are required to deploy a space.',
      }),
      {
        status: 400,
      }
    );
  }

  if (initialEditorAddress === null) {
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

  const spaceId = await deploySpace({
    initialEditorAddress,
    spaceName,
    spaceAvatarUri,
    type,
    baseUrl: `${protocol}//${baseUrl}`,
  });

  return Response.json({ spaceId });
}

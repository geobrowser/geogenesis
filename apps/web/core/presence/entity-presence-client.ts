import { createClient } from '@liveblocks/client';

import { Environment } from '../environment';

export const client = createClient({
  publicApiKey: Environment.VarsLive.liveBlocksPublicKey ?? 'pk_bananas',
});

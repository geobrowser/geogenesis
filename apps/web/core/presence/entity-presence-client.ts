import { createClient } from '@liveblocks/client';

import { Environment } from '../environment';

export const client = createClient({
  publicApiKey: Environment.variables.liveBlocksPublicKey ?? 'pk_bananas',
});

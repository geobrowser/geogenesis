import { createClient } from '@liveblocks/client';

export const client = createClient({
  publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY ?? 'pk_bananas',
});

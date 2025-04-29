import type { InferSelectModel } from 'drizzle-orm';
import { boolean, jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const ipfsCache = pgTable('ipfs_cache', {
  id: serial(),
  json: jsonb(),
  uri: text().notNull().unique(),
  /**
   * Sometimes an IPFS fetch can fail for multiple reasons. Primarily
   * we care about cases where we fetched it correctly but it was in
   * an incorrect format. We need to signal to consumers that the cache
   * has the IPFS CID, but was unable to parse it.
   */
  isErrored: boolean().default(false),
});

export type IpfsCacheItem = InferSelectModel<typeof ipfsCache>;

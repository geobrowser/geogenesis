import * as db from "zapatos/db";
import type * as s from "zapatos/schema";
import { readCacheCursor } from "./cursor";
import { populateWithFullEntries } from "./populateEntries";
import { pool } from "./utils/pool";
import { FullEntry, RoleChange } from "./zod";

export const populateFromCache = async () => {
  const cachedEntries = await readCacheEntries();
  const cachedRoles = await readCacheRoles();
  const cachedCursor = await readCacheCursor();

  for (const cachedEntry of cachedEntries) {
    await populateWithFullEntries({
      fullEntries: cachedEntry.data as any, // TODO: Zod typecheck this JSON
      blockNumber: cachedEntry.block_number,
      timestamp: cachedEntry.timestamp,
      cursor: cachedEntry.cursor,
    });
  }
};

export const upsertCachedEntries = async ({
  fullEntries,
  blockNumber,
  cursor,
  timestamp,
}: {
  fullEntries: FullEntry[];
  blockNumber: number;
  cursor: string;
  timestamp: number;
}) => {
  const cachedEntry: s.cache.entries.Insertable = {
    block_number: blockNumber,
    cursor,
    data: JSON.stringify(fullEntries),
    timestamp,
  };

  await db
    .upsert("cache.entries", cachedEntry, ["cursor"], {
      updateColumns: db.doNothing,
    })
    .run(pool);
};

export const upsertCachedRoles = async ({
  roleChange,
  blockNumber,
  cursor,
  type,
}: {
  roleChange: RoleChange;
  blockNumber: number;
  cursor: string;
  type: "GRANTED" | "REVOKED";
}) => {
  const cachedRole: s.cache.roles.Insertable = {
    block_number: blockNumber,
    role: roleChange.role,
    space: roleChange.space,
    account: roleChange.account,
    cursor,
    sender: roleChange.sender,
    type,
  };

  await db
    .upsert(
      "cache.roles",
      cachedRole,
      ["role", "account", "sender", "space", "type", "block_number", "cursor"],
      {
        updateColumns: db.doNothing,
      }
    )
    .run(pool);
};

export const readCacheEntries = async () => {
  const cachedEntries = await db
    .select("cache.entries", db.all, { order: { by: "id", direction: "ASC" } })
    .run(pool);

  return cachedEntries;
};

export const readCacheRoles = async () => {
  const cachedEntries = await db
    .select("cache.roles", db.all, { order: { by: "id", direction: "ASC" } })
    .run(pool);

  return cachedEntries;
};

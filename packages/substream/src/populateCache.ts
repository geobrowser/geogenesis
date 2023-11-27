import * as db from "zapatos/db";
import type * as s from "zapatos/schema";
import { genesisStartBlockNum } from "./constants/constants";
import { populateWithFullEntries } from "./populateEntries";
import { handleRoleGranted, handleRoleRevoked } from "./populateRoles";
import { pool } from "./utils/pool";
import { FullEntry, RoleChange, ZodRoleChange } from "./zod";

export const populateFromCache = async () => {
  try {
    const cachedEntries = await readCacheEntries();
    console.log("Cached entries:", cachedEntries.length);
    const cachedRoles = await readCacheRoles();
    console.log("Cached roles:", cachedRoles.length);

    let blockNumber = genesisStartBlockNum;

    for (let i = 0; i < cachedEntries.length; i++) {
      console.log(`Processing cachedEntry at index: ${i}`);
      await populateWithFullEntries({
        fullEntries: cachedEntries[i].data as any, // TODO: Zod typecheck this JSON
        blockNumber: cachedEntries[i].block_number,
        timestamp: cachedEntries[i].timestamp,
        cursor: cachedEntries[i].cursor,
      });

      blockNumber = cachedEntries[i].block_number;
    }
    for (let i = 0; i < cachedRoles.length; i++) {
      console.log(`Processing cachedRole at index: ${i}`);
      const cachedRole = cachedRoles[i];
      const roleChange = ZodRoleChange.safeParse({
        role: cachedRole.role,
        space: cachedRole.space,
        account: cachedRole.account,
        sender: cachedRole.sender,
      });

      if (!roleChange.success) {
        console.error("Failed to parse cached role change");
        console.error(roleChange);
        console.error(roleChange.error);
        continue;
      }

      if (cachedRole.type === "GRANTED") {
        await handleRoleGranted({
          roleGranted: roleChange.data,
          blockNumber: cachedRole.created_at_block,
          timestamp: cachedRole.created_at,
          cursor: cachedRole.cursor,
        });
      } else if (cachedRole.type === "REVOKED") {
        await handleRoleRevoked({
          roleRevoked: roleChange.data,
          blockNumber: cachedRole.created_at_block,
          cursor: cachedRole.cursor,
          timestamp: cachedRole.created_at,
        });
      }

      if (cachedRole.created_at_block > blockNumber) {
        blockNumber = cachedRole.created_at_block;
      }
    }
    return blockNumber;
  } catch (error) {
    console.error("Error in populateFromCache:", error);
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
  try {
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
  } catch (error) {
    console.error("Error upserting cached entry:", error);
  }
};

export const upsertCachedRoles = async ({
  roleChange,
  blockNumber,
  cursor,
  type,
  timestamp,
}: {
  roleChange: RoleChange;
  timestamp: number;
  blockNumber: number;
  cursor: string;
  type: "GRANTED" | "REVOKED";
}) => {
  try {
    const cachedRole: s.cache.roles.Insertable = {
      created_at: timestamp,
      created_at_block: blockNumber,
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
        [
          "role",
          "account",
          "sender",
          "space",
          "type",
          "created_at_block",
          "cursor",
        ],
        {
          updateColumns: db.doNothing,
        }
      )
      .run(pool);
  } catch (error) {
    console.error("Error upserting cached role:", error);
  }
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

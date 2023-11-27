import * as db from "zapatos/db";
import { pool } from "./utils/pool";

export const readCursor = async () => {
  const cursor = await db.selectOne("cursors", { id: 0 }).run(pool);
  console.log("Using cursor with start block:", cursor?.block_number);
  return cursor?.cursor;
};

export const writeCursor = async (cursor: string, block_number: number) => {
  try {
    await db.upsert("cursors", { id: 0, cursor, block_number }, "id").run(pool);
  } catch (error) {
    console.error("Error writing cursor:", error);
  }
};

import * as db from "zapatos/db";
import { Insertable, Table } from "zapatos/schema";
import { pool } from "./pool";

/* 
Chunking to prevent 'bind message has x parameter formats' error https://github.com/brianc/node-postgres/issues/2579 
4,000 is the max number of parameters allowed in a single query for my local Postgres, don't know if this is universal
*/
export const insertChunked = async (tableName: Table, values: Insertable[]) => {
  const chunkSize = 4000;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await db.insert(tableName, chunk).run(pool);
  }
};

/* Couldn't fully figure out the type puzzle here, conflictTarget: any + options: any for now */
export const upsertChunked = async (
  tableName: Table,
  values: Insertable[],
  conflictTarget: any,
  options?: any
) => {
  const chunkSize = 4000;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await db.upsert(tableName, chunk, conflictTarget, options).run(pool);
  }
};

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';
import { copyBulk } from './copy';

export class Versions {
  static async copy(versions: S.versions.Insertable[]) {
    await copyBulk('versions', versions);
  }

  static async upsert(
    versions: S.versions.Insertable[],
    options: { chunked?: boolean; txClient?: db.TxnClient<db.IsolationLevel.Serializable> } = {}
  ) {
    const client = options.txClient ?? pool;

    if (options.chunked) {
      for (let i = 0; i < versions.length; i += CHUNK_SIZE) {
        const chunk = versions.slice(i, i + CHUNK_SIZE);

        await db.upsert('versions', chunk, ['id'], { updateColumns: db.doNothing }).run(client);
      }

      return;
    }

    return await db.upsert('versions', versions, ['id'], { updateColumns: db.doNothing }).run(client);
  }

  static async insert(
    versions: S.versions.Insertable[],
    options: { chunked?: boolean; txClient?: db.TxnClient<db.IsolationLevel.Serializable> } = {}
  ) {
    const client = options.txClient ?? pool;

    if (options.chunked) {
      for (let i = 0; i < versions.length; i += CHUNK_SIZE) {
        const chunk = versions.slice(i, i + CHUNK_SIZE);

        await db.insert('versions', chunk).run(client);
      }

      return;
    }

    return await db.insert('versions', versions).run(client);
  }

  static async upsertMetadata(
    versions: S.versions.Insertable[],
    { chunked, txClient }: { chunked?: boolean; txClient?: db.TxnClient<db.IsolationLevel.Serializable> } = {}
  ) {
    const client = txClient ?? pool;

    if (chunked) {
      for (let i = 0; i < versions.length; i += CHUNK_SIZE) {
        const chunk = versions.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('versions', chunk, ['id'], {
            updateColumns: ['name', 'description'],
          })
          .run(client);
      }

      return;
    }

    return await db.upsert('versions', versions, ['id'], { updateColumns: ['name', 'description'] }).run(client);
  }

  static select(where: S.versions.Whereable) {
    return db.select('versions', where).run(pool);
  }

  static selectOne(where: S.versions.Whereable) {
    return db
      .selectOne('versions', where, {
        columns: ['id', 'entity_id', 'created_at_block'],
      })
      .run(pool);
  }
}

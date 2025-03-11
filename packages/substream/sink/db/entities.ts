import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';
import { copyBulk } from './copy';

export class Entities {
  static async copy(entities: S.entities.Insertable[]) {
    await copyBulk('entities', entities);
  }

  static async upsert(
    entities: S.entities.Insertable[],
    { chunked, txClient }: { chunked?: boolean; txClient?: db.TxnClient<db.IsolationLevel.Serializable> } = {}
  ) {
    const client = txClient ?? pool;

    if (chunked) {
      for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
        const chunk = entities.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('entities', chunk, db.constraint('entities_pkey'), {
            updateColumns: ['updated_at', 'updated_at_block', 'created_by_id'],
          })
          .run(client);
      }

      return;
    }

    return await db
      .upsert('entities', entities, db.constraint('entities_pkey'), {
        updateColumns: ['updated_at', 'updated_at_block'],
        noNullUpdateColumns: ['updated_at', 'updated_at_block', 'created_by_id'],
      })
      .run(client);
  }
}

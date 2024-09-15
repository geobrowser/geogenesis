import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class Ops {
  static async upsert(ops: S.ops.Insertable[], { chunked }: { chunked?: boolean } = {}) {
    if (chunked) {
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const chunk = ops.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('ops', chunk, db.constraint('ops_pkey'), {
            updateColumns: db.doNothing,
          })
          .run(pool);
      }

      return;
    }
    return await db.upsert('ops', ops, db.constraint('ops_pkey'), { updateColumns: db.doNothing }).run(pool);
  }
}

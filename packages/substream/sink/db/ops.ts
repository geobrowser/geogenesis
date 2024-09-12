import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class Ops {
  static async upsert(ops: S.ops.Insertable[], { chunk }: { chunk?: boolean } = {}) {
    if (chunk) {
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const chunk = ops.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('ops', chunk, ['id'], {
            updateColumns: db.doNothing,
          })
          .run(pool);
      }

      return;
    }

    return await db
      .upsert('ops', ops, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

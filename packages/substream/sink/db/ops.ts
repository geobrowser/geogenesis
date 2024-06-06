import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Ops {
  static async upsert(ops: S.ops.Insertable[]) {
    return await db
      .upsert('ops', ops, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

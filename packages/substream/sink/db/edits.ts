import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Edits {
  static async upsert(edits: S.edits.Insertable[]) {
    return await db
      .upsert('edits', edits, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Proposals {
  static async upsert(proposals: S.proposals.Insertable[]) {
    return await db
      .upsert('proposals', proposals, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

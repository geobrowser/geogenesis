import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Blocks {
  static async upsert(blocks: S.geo_blocks.Insertable[]) {
    return await db
      .upsert('geo_blocks', blocks, db.constraint('geo_blocks_pkey'), {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

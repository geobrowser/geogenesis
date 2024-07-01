import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Entities {
  static async upsert(entities: S.entities.Insertable[]) {
    return await db
      .upsert('entities', entities, db.constraint('entities_pkey'), {
        updateColumns: ['description', 'name', 'updated_at', 'updated_at_block'],
        noNullUpdateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
      })
      .run(pool);
  }
}

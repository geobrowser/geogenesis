import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Entities {
  static async upsert(entities: S.geo_entities.Insertable[]) {
    return await db
      .upsert('geo_entities', entities, db.constraint('geo_entities_pkey'), {
        updateColumns: ['description', 'name', 'updated_at', 'updated_at_block'],
      })
      .run(pool);
  }
}

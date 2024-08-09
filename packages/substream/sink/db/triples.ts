import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Triples {
  static async upsert(triples: S.triples.Insertable[]) {
    return await db
      .upsert('triples', triples, db.constraint('triples_pkey'), {
        updateColumns: [
          'attribute_id',
          'created_at',
          'created_at_block',
          'entity_id',
          'entity_value_id',
          'number_value',
          'space_id',
          'text_value',
          'value_type',
          'is_stale',
        ],
      })
      .run(pool);
  }

  static async insert(triples: S.triples.Insertable[]) {
    return await db.insert('triples', triples).run(pool);
  }

  static async remove(triples: S.triples.Whereable) {
    return await db.deletes('triples', triples).run(pool);
  }

  static async select(where: S.triples.Whereable) {
    return await db.select('triples', where).run(pool);
  }
}

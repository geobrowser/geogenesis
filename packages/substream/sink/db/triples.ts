import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Triples {
  static async upsert(triples: S.triples.Insertable[]) {
    return await db
      .upsert('triples', triples, db.constraint('triples_pkey'), {
        updateColumns: [
          'attribute_id',
          'collection_value_id',
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
}

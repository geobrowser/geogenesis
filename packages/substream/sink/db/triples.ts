import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class Triples {
  static async upsert(triples: S.triples.Insertable[], options: { chunked?: boolean } = {}) {
    if (options.chunked) {
      for (let i = 0; i < triples.length; i += CHUNK_SIZE) {
        const chunk = triples.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('triples', chunk, db.constraint('triples_pkey'), {
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
              'version_id',
            ],
          })
          .run(pool);
      }

      return;
    }

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
          'version_id',
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

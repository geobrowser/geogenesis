import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Triples {
  static async upsert(triples: S.triplesv2.Insertable[]) {
    return await db.upsert('triplesv2', triples, ['space_id', 'entity_id', 'attribute_id']).run(pool);
  }
}

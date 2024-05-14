import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Triples {
  static async upsert(triples: S.triples.Insertable[]) {
    return await db.upsert('triples', triples, ['id']).run(pool);
  }
}

export class TriplesV2 {
  static async upsert(triples: S.triplesv2.Insertable[]) {
    return await db.upsert('triplesv2', triples, ['space_id', 'entity_id', 'attribute_id']).run(pool);
  }
}

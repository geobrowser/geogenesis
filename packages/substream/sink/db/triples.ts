import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Triples {
  static async upsert(triples: S.triples.Insertable[]) {
    return await db.upsert('triples', triples, ['id']).run(pool);
  }
}

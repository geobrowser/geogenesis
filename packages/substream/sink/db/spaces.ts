import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Spaces {
  static async upsert(spaces: S.spaces.Insertable[]) {
    return await db.upsert('spaces', spaces, ['id']).run(pool);
  }
}

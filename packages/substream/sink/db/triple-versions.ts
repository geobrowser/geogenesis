import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class TripleVersions {
  static async upsert(tripleVersions: S.triple_versions.Insertable[]) {
    return await db
      .upsert('triple_versions', tripleVersions, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class VersionSpaces {
  static async upsert(entities: S.version_spaces.Insertable[]) {
    return await db
      .upsert('version_spaces', entities, db.constraint('version_spaces_pkey'), {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class CurrentVersions {
  static async upsert(versions: S.current_versions.Insertable[]) {
    return await db.upsert('current_versions', versions, db.constraint('current_versions_pkey')).run(pool);
  }
}

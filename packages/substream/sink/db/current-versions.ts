import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class CurrentVersions {
  static async upsert(versions: S.current_versions.Insertable[]) {
    return await db.upsert('current_versions', versions, db.constraint('current_versions_pkey')).run(pool);
  }

  static async selectOne(where: S.current_versions.Whereable) {
    return db.selectOne('current_versions', where).run(pool);
  }

  static async select(where: S.current_versions.Whereable) {
    return db.select('current_versions', where).run(pool);
  }
}

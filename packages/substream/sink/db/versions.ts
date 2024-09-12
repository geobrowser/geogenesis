import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Versions {
  static async upsert(versions: S.versions.Insertable[]) {
    return await db.upsert('versions', versions, ['id'], { updateColumns: db.doNothing }).run(pool);
  }
}

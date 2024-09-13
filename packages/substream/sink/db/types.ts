import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Types {
  static async upsert(types: S.entity_types.Insertable[]) {
    return await db.upsert('entity_types', types, ['version_id', 'type_id'], { updateColumns: db.doNothing }).run(pool);
  }

  static async remove(where: S.entity_types.Whereable) {
    return await db.deletes('entity_types', where).run(pool);
  }
}

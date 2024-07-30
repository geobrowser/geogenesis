import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Types {
  static async upsert(types: S.entity_types.Insertable[]) {
    return await db.upsert('entity_types', types, ['entity_id', 'type_id'], { updateColumns: db.doNothing }).run(pool);
  }
}

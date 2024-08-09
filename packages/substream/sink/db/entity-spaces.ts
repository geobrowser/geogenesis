import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class EntitySpaces {
  static async upsert(entities: S.entity_spaces.Insertable[]) {
    return await db
      .upsert('entity_spaces', entities, db.constraint('entity_spaces_pkey'), {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }

  static async remove(entities: S.entity_spaces.Whereable) {
    return await db.deletes('entity_spaces', entities).run(pool);
  }
}

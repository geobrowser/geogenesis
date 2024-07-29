import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Relations {
  static async upsert(relations: S.relations.Insertable[]) {
    return await db
      .upsert('relations', relations, ['id'], {
        updateColumns: ['entity_id', 'id', 'from_entity_id', 'to_entity_id', 'type_of_id', 'index'],
      })
      .run(pool);
  }

  static async remove(relation: S.relations.Whereable) {
    return await db.deletes('relations', relation).run(pool);
  }

  static async update(relation: S.relations.Updatable) {
    return await db
      .update('relations', relation, {
        id: relation.id,
      })
      .run(pool);
  }
}

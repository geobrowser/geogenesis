import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Relations {
  static async upsert(relations: S.relations.Insertable[]) {
    return await db
      .upsert('relations', relations, ['id'], {
        updateColumns: ['entity_id', 'id', 'from_version_id', 'to_version_id', 'type_of_id', 'index'],
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

  static async selectOne(relation: S.relations.Whereable) {
    return await db
      .selectOne('relations', relation, {
        columns: ['id', 'entity_id', 'from_version_id', 'to_version_id', 'type_of_id'],
      })
      .run(pool);
  }
}

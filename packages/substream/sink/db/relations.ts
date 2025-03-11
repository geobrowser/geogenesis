import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';
import { copyBulk } from './copy';

export class Relations {
  static async copy(relations: S.relations.Insertable[]) {
    return await copyBulk('relations', relations);
  }

  static async upsert(relations: S.relations.Insertable[], { chunked }: { chunked?: boolean } = {}) {
    if (chunked) {
      for (let i = 0; i < relations.length; i += CHUNK_SIZE) {
        const chunk = relations.slice(i, i + CHUNK_SIZE);

        await db
          .upsert('relations', chunk, ['id'], {
            updateColumns: ['entity_id', 'id', 'from_version_id', 'to_version_id', 'type_of_id', 'index', 'space_id'],
          })
          .run(pool);
      }

      return;
    }

    return await db
      .upsert('relations', relations, ['id'], {
        updateColumns: ['entity_id', 'id', 'from_version_id', 'to_version_id', 'type_of_id', 'index', 'space_id'],
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
        columns: ['id', 'entity_id', 'from_version_id', 'to_version_id', 'type_of_id', 'space_id'],
      })
      .run(pool);
  }

  static async select(relation: S.relations.Whereable) {
    return await db
      .select('relations', relation, {
        columns: [
          'id',
          'entity_id',
          'from_version_id',
          'to_version_id',
          'type_of_id',
          'index',
          'space_id',
          'type_of_version_id',
          'from_entity_id',
          'to_entity_id',
        ],
      })
      .run(pool);
  }
}

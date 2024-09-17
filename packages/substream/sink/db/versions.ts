import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Versions {
  static async upsert(versions: S.versions.Insertable[]) {
    return await db.upsert('versions', versions, ['id'], { updateColumns: db.doNothing }).run(pool);
  }

  static findOne(where: S.versions.Whereable) {
    return db.selectOne('versions', where).run(pool);
  }

  static findMany(where: S.versions.Whereable) {
    return db.select('versions', where).run(pool);
  }

  static async findLatestValid(entityId: string) {
    const res = await db
      .select(
        'versions',
        { entity_id: entityId },
        {
          columns: ['id', 'entity_id', 'edit_id'],
          order: {
            by: 'created_at',
            direction: 'DESC',
          },
          limit: 1,
          lateral: {
            proposal: db.selectOne('proposals', { status: 'accepted' }, { columns: ['id'] }),
          },
        }
      )
      .run(pool);

    if (res.length === 0) {
      return null;
    }

    return res[0];
  }
}

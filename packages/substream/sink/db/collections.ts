import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Collections {
  static async upsert(collections: S.collections.Insertable[]) {
    return await db
      .upsert('collections', collections, ['id'], {
        updateColumns: ['entity_id', 'id'],
      })
      .run(pool);
  }

  static async remove(collectionItem: S.collections.Whereable) {
    return await db.deletes('collections', collectionItem).run(pool);
  }
}

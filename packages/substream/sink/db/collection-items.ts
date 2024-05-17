import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class CollectionItems {
  static async upsert(collection_items: S.collection_items.Insertable[]) {
    return await db
      .upsert('collection_items', collection_items, ['id'], {
        updateColumns: ['entity_id', 'id', 'collection_id', 'collection_item_entity_id', 'index'],
      })
      .run(pool);
  }
}

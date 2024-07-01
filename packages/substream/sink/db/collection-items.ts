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

  static async remove(collectionItem: S.collection_items.Whereable) {
    return await db.deletes('collection_items', collectionItem).run(pool);
  }

  static async update(collection_item: S.collection_items.Updatable) {
    return await db
      .update('collection_items', collection_item, {
        id: collection_item.id,
      })
      .run(pool);
  }
}

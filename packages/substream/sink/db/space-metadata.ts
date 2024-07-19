import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class SpaceMetadata {
  static async upsert(metadata: S.spaces_metadata.Insertable[]) {
    return await db
      .upsert('spaces_metadata', metadata, db.constraint('space_metadata_unique_entity_space_pair'), {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }

  static remove(metadataEntry: S.spaces_metadata.Whereable) {
    return db.deletes('spaces_metadata', metadataEntry).run(pool);
  }
}

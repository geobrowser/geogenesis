import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class SpaceMetadata {
  static async upsert(metadata: S.spaces_metadata.Insertable[], options: { chunked?: boolean } = {}) {
    if (options.chunked) {
      for (let i = 0; i < metadata.length; i += CHUNK_SIZE) {
        const chunk = metadata.slice(i, i + CHUNK_SIZE);
        await db.upsert('spaces_metadata', chunk, db.constraint('spaces_metadata_unique_id')).run(pool);
      }

      return;
    }

    return await db.upsert('spaces_metadata', metadata, db.constraint('spaces_metadata_unique_id')).run(pool);
  }

  static remove(metadataEntry: S.spaces_metadata.Whereable) {
    return db.deletes('spaces_metadata', metadataEntry).run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class VersionSpaces {
  static async upsert(entities: S.version_spaces.Insertable[], { chunked }: { chunked?: boolean } = {}) {
    if (chunked) {
      for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
        const chunk = entities.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('version_spaces', chunk, db.constraint('version_spaces_pkey'), {
            updateColumns: db.doNothing,
          })
          .run(pool);
      }

      return;
    }

    return await db
      .upsert('version_spaces', entities, db.constraint('version_spaces_pkey'), {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

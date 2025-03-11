import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';
import { copyBulk } from './copy';

export class Types {
  static async copy(types: S.version_types.Insertable[]) {
    return await copyBulk('version_types', types);
  }

  static async upsert(types: S.version_types.Insertable[], { chunked }: { chunked?: boolean } = {}) {
    if (chunked) {
      for (let i = 0; i < types.length; i += CHUNK_SIZE) {
        const chunk = types.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('version_types', chunk, ['version_id', 'type_id'], {
            updateColumns: db.doNothing,
          })
          .run(pool);
      }

      return;
    }

    return await db
      .upsert('version_types', types, ['version_id', 'type_id'], { updateColumns: db.doNothing })
      .run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class Edits {
  static async upsert(edits: S.edits.Insertable[], options: { chunked?: boolean } = {}) {
    if (options.chunked) {
      for (let i = 0; i < edits.length; i += CHUNK_SIZE) {
        const chunk = edits.slice(i, i + CHUNK_SIZE);
        await db
          .upsert('edits', chunk, ['id'], {
            updateColumns: db.doNothing,
          })
          .run(pool);
      }

      return;
    }

    return await db
      .upsert('edits', edits, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }

  static async insert(edits: S.edits.Insertable[], options: { chunked?: boolean } = {}) {
    if (options.chunked) {
      for (let i = 0; i < edits.length; i += CHUNK_SIZE) {
        const chunk = edits.slice(i, i + CHUNK_SIZE);
        await db.insert('edits', chunk).run(pool);
      }

      return;
    }

    return await db.insert('edits', edits).run(pool);
  }
}

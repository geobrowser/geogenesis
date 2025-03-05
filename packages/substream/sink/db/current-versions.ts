import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class CurrentVersions {
  static async upsert(versions: S.current_versions.Insertable[], { chunked }: { chunked?: boolean } = {}) {
    if (chunked) {
      for (let i = 0; i < versions.length; i += CHUNK_SIZE) {
        const chunk = versions.slice(i, i + CHUNK_SIZE);
        await db.upsert('current_versions', chunk, db.constraint('current_versions_pkey')).run(pool);
      }

      return;
    }

    return await db.upsert('current_versions', versions, db.constraint('current_versions_pkey')).run(pool);
  }

  static async selectOne(where: S.current_versions.Whereable) {
    return db.selectOne('current_versions', where, { columns: ['entity_id', 'version_id'] }).run(pool);
  }

  static async select(where: S.current_versions.Whereable) {
    return db.select('current_versions', where).run(pool);
  }
}

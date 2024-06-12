import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class ProposedVersions {
  static async upsert(proposedVersions: S.proposed_versions.Insertable[]) {
    return await db
      .upsert('proposed_versions', proposedVersions, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

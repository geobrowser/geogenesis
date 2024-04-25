import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class SpaceEditors {
  static async upsert(spaceEditors: S.space_editors.Insertable[]) {
    return await db
      .upsert('space_editors_v2', spaceEditors, ['account_id', 'space_id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

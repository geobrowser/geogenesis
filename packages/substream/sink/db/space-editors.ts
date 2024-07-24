import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class SpaceEditors {
  static async upsert(spaceEditors: S.space_editors.Insertable[]) {
    return await db
      .upsert('space_editors', spaceEditors, ['account_id', 'space_id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }

  static async remove(spaceEditor: S.space_editors.Whereable) {
    return await db.deletes('space_editors', spaceEditor).run(pool);
  }
}

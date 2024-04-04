import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Actions {
  static upsert(actions: S.actions.Insertable[]) {
    return db
      .upsert('actions', actions, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class SpaceMembers {
  static upsert(spaceMembers: S.space_members.Insertable[]) {
    return db
      .upsert('space_members', spaceMembers, ['account_id', 'space_id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

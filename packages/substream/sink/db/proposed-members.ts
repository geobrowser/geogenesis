import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class ProposedMembers {
  static upsert(proposedMembers: S.proposed_members.Insertable[]) {
    return db
      .upsert('proposed_members', proposedMembers, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

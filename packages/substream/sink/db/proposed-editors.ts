import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class ProposedEditors {
  static upsert(proposedEditors: S.proposed_editors.Insertable[]) {
    return db
      .upsert('proposed_editors', proposedEditors, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

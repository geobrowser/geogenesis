import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class ProposedSubspaces {
  static upsert(proposedSubspaces: S.proposed_subspaces.Insertable[]) {
    return db
      .upsert('proposed_subspaces', proposedSubspaces, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

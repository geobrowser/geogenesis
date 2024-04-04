import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Proposals {
  static insert(proposals: S.proposals.Insertable[]) {
    return db.insert('proposals', proposals).run(pool);
  }
}

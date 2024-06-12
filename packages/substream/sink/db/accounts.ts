import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Accounts {
  static async upsert(accounts: S.accounts.Insertable[]) {
    return await db
      .upsert('accounts', accounts, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

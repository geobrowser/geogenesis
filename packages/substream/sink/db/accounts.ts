import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Accounts {
  static upsert(accounts: S.accounts.Insertable[]) {
    return db
      .upsert('accounts', accounts, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

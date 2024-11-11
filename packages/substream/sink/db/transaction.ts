import * as db from 'zapatos/db';

import { pool } from '../utils/pool';

export class Transaction {
  static async run(fn: (client: db.TxnClient<db.IsolationLevel.Serializable>) => Promise<boolean>) {
    return await db.transaction(pool, db.IsolationLevel.Serializable, fn);
  }
}

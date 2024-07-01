import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class OnchainProfiles {
  static async upsert(onchain_profiles: S.onchain_profiles.Insertable[]) {
    return await db.upsert('onchain_profiles', onchain_profiles, ['id']).run(pool);
  }
}

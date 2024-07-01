import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Subspaces {
  static async upsert(subspaces: S.space_subspaces.Insertable[]) {
    return await db.upsert('space_subspaces', subspaces, ['parent_space_id', 'subspace_id']).run(pool);
  }

  static async remove(subspaces: S.space_subspaces.Whereable) {
    return await db.deletes('space_subspaces', subspaces);
  }
}

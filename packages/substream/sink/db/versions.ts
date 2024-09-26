import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class Versions {
  static async upsert(versions: S.versions.Insertable[]) {
    return await db.upsert('versions', versions, ['id'], { updateColumns: db.doNothing }).run(pool);
  }

  static async upsertMetadata(versions: S.versions.Insertable[]) {
    return await db.upsert('versions', versions, ['id'], { updateColumns: ['name', 'description'] }).run(pool);
  }

  static findOne(where: S.versions.Whereable) {
    return db.selectOne('versions', where).run(pool);
  }

  static select(where: S.versions.Whereable) {
    return db.select('versions', where).run(pool);
  }

  static findMany(where: S.versions.Whereable) {
    return db.select('versions', where).run(pool);
  }

  static async findLatestValid(entityId: string) {
    const res = await db
      .select(
        'versions',
        { entity_id: entityId },
        {
          columns: ['id', 'entity_id', 'edit_id'],
          order: {
            by: 'created_at',
            direction: 'DESC',
          },
          // @TODO(performance): Can't figure out how to conditionally select
          // the version where it's proposal is accepted, so we just query
          // all versions and filter out the ones that aren't accepted in JS.
          lateral: {
            proposal: db.selectOne(
              'proposals',
              { status: 'accepted', edit_id: db.parent('edit_id') },
              { columns: ['id'] }
            ),
          },
        }
      )
      .run(pool);

    if (res.length === 0) {
      return null;
    }

    const latestApprovedVersion = res.filter(v => v.proposal !== null)[0];
    return latestApprovedVersion ?? null;
  }
}

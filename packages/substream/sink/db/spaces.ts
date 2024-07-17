import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../utils/get-checksum-address';
import { pool } from '../utils/pool';

export class Spaces {
  static async upsert(spaces: S.spaces.Insertable[]) {
    return await db.upsert('spaces', spaces, ['id']).run(pool);
  }

  static async getById(spaceId: string) {
    return await db.selectExactlyOne('spaces', { id: spaceId }, { columns: ['id', 'type'] }).run(pool);
  }

  static async findForDaoAddress(daoAddress: string) {
    const result = await db
      .selectOne('spaces', { dao_address: getChecksumAddress(daoAddress) }, { columns: ['id', 'dao_address'] })
      .run(pool);

    return result ? result : null;
  }

  static async findForVotingPlugin(votingPluginAddress: string) {
    const result = await db
      .selectOne('spaces', { main_voting_plugin_address: getChecksumAddress(votingPluginAddress) }, { columns: ['id'] })
      .run(pool);

    return result ? result.id : null;
  }

  static async findForPersonalPlugin(personalPluginAddress: string) {
    const result = await db
      .selectOne(
        'spaces',
        { personal_space_admin_plugin_address: getChecksumAddress(personalPluginAddress) },
        { columns: ['id', 'personal_space_admin_plugin_address'] }
      )
      .run(pool);

    return result
      ? {
          id: result.id,
          personal_space_admin_plugin_address: result.personal_space_admin_plugin_address,
        }
      : null;
  }

  static async findForMembershipPlugin(membershipPluginAddress: string) {
    const result = await db
      .selectOne(
        'spaces',
        { member_access_plugin_address: getChecksumAddress(membershipPluginAddress) },
        { columns: ['id'] }
      )
      .run(pool);

    return result ? result.id : null;
  }

  static async findForSpacePlugin(spacePluginAddress: string) {
    const result = await db
      .selectOne(
        'spaces',
        { space_plugin_address: getChecksumAddress(spacePluginAddress) },
        { columns: ['id', 'space_plugin_address'] }
      )
      .run(pool);

    return result
      ? {
          id: result.id,
          space_plugin_address: result.space_plugin_address,
        }
      : null;
  }
}

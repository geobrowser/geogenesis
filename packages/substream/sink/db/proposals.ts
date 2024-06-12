import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../utils/get-checksum-address';
import { pool } from '../utils/pool';

export class Proposals {
  static async upsert(proposals: S.proposals.Insertable[]) {
    return await db
      .upsert('proposals', proposals, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }

  static async getOne({
    onchainProposalId,
    pluginAddress,
    type,
  }: {
    onchainProposalId: string;
    pluginAddress: string;
    type: S.proposal_type;
  }) {
    return await db
      .selectOne('proposals', {
        onchain_proposal_id: onchainProposalId,
        plugin_address: getChecksumAddress(pluginAddress),
        type: type,
      })
      .run(pool);
  }

  static async setAccepted({
    onchainProposalId,
    pluginAddress,
    type,
  }: {
    onchainProposalId: string;
    pluginAddress: string;
    type: S.proposal_type;
  }) {
    return await db
      .update(
        'proposals',
        { status: 'accepted' },
        {
          onchain_proposal_id: onchainProposalId,
          plugin_address: getChecksumAddress(pluginAddress),
          type: type,
        }
      )
      .run(pool);
  }
}

import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../utils/get-checksum-address';
import { pool } from '../utils/pool';
import { CHUNK_SIZE } from './constants';

export class Proposals {
  static async upsert(proposals: S.proposals.Insertable[], options: { chunked?: boolean } = {}) {
    if (options.chunked) {
      for (let i = 0; i < proposals.length; i += CHUNK_SIZE) {
        const chunk = proposals.slice(i, i + CHUNK_SIZE);

        await db
          .upsert('proposals', chunk, ['id'], {
            updateColumns: db.doNothing,
          })
          .run(pool);
      }

      return;
    }

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

  static async getExactlyOneById(id: string) {
    return await db
      .selectExactlyOne('proposals', {
        id,
      })
      .run(pool);
  }

  static async setAcceptedById(id: string) {
    return await db.update('proposals', { status: 'accepted' }, { id }).run(pool);
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

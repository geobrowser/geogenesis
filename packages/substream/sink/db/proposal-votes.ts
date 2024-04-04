import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class ProposalVotes {
  static upsert(proposalVotes: S.proposal_votes.Insertable[]) {
    return db
      .upsert('proposal_votes', proposalVotes, ['account_id', 'space_id', 'proposal_id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  }
}

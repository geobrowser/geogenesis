import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { pool } from '../utils/pool';

export class ProposalVotes {
  static async insert(proposalVotes: S.proposal_votes.Insertable[]) {
    return await db.insert('proposal_votes', proposalVotes).run(pool);
  }
}

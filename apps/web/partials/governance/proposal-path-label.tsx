import type { ProposalVotingMode } from '~/core/hooks/use-publish';

import { FastPath } from '~/design-system/icons/fast-path';
import { Time } from '~/design-system/icons/time';

/**
 * How a governance path is named and iconed, in one place.
 *
 * The author picks the path in `ProposalPathSelector` and a reviewer reads it back on the
 * proposal, so the two have to agree: a proposal submitted under "Fast path" that reviews
 * as something else is worse than not showing it at all. Both render this.
 */
export function proposalPathName(votingMode: ProposalVotingMode): string {
  return votingMode === 'FAST' ? 'Fast path' : 'Review path';
}

export function ProposalPathLabel({ votingMode }: { votingMode: ProposalVotingMode }) {
  return (
    <>
      {votingMode === 'FAST' ? <FastPath /> : <Time />}
      {proposalPathName(votingMode)}
    </>
  );
}

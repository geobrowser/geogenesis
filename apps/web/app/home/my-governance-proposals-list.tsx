import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { getMyGovernanceProposals } from './fetch-my-governance-proposals';

type Props = {
  memberSpaceId: string;
  spaceIds: string[];
  spaceFilter?: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
};

export async function MyGovernanceProposalsList({
  memberSpaceId,
  spaceIds,
  spaceFilter,
  category,
  status,
}: Props) {
  const { proposals } = await getMyGovernanceProposals({
    memberSpaceId,
    spaceIds,
    spaceFilter,
    category,
    status,
    page: 0,
  });

  if (proposals.length === 0) {
    return <p className="text-body text-grey-04">No proposals match these filters.</p>;
  }

  const spaces = await Promise.all(proposals.map(p => cachedFetchSpace(p.spaceId)));
  const spaceById = new Map(proposals.map((p, i) => [p.spaceId, spaces[i]]));

  return (
    <div className="space-y-2">
      {proposals.map(p => {
        const space = spaceById.get(p.spaceId);
        const spaceName = space?.entity?.name ?? p.spaceId;
        return (
          <div key={p.id} className="rounded-lg border border-grey-02 p-4">
            <Link
              href={NavUtils.toProposal(p.spaceId, p.id, 'home')}
              className="text-smallTitle hover:text-text"
            >
              {p.name}
            </Link>
            <div className="mt-1 text-breadcrumb text-grey-04">
              <Link href={NavUtils.toSpace(p.spaceId)} className="hover:text-text">
                {spaceName}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

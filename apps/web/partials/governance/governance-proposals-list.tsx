import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';
import { options } from '~/core/environment/environment';
import { Subgraph } from '~/core/io';
import { fetchInterimMembershipRequests } from '~/core/io/subgraph/fetch-interim-membership-requests';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';

import { Avatar } from '~/design-system/avatar';

import { getEditorsForSpace } from '../space-page/get-editors-for-space';
import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';

interface Props {
  spaceId: string;
}

export async function GovernanceProposalsList({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;

  const [proposals, editorsForSpace, requests] = await Promise.all([
    Subgraph.fetchProposals({ spaceId, first: 5, endpoint: options.production.subgraph }),
    getEditorsForSpace(spaceId, connectedAddress),
    fetchInterimMembershipRequests({ endpoint: options.production.membershipSubgraph, spaceId }),
  ]);

  return (
    <div className="flex flex-col gap-3">
      {proposals.map(p => {
        const changeCount = Action.getChangeCount(
          p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
        );

        return (
          <div key={p.id} className="w-full rounded border border-grey-02 p-4 shadow-button">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-smallTitle">{p.name}</h3>
                <div className="flex items-center gap-5 text-breadcrumb text-grey-04">
                  <div className="flex items-center gap-1.5">
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar avatarUrl={p.createdBy.avatarUrl} value={p.createdBy.id} />
                    </div>
                    <p>{p.createdBy.name ?? p.createdBy.id}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p>
                      {changeCount} {pluralize('edit', changeCount)}
                    </p>
                    <p>·</p>
                    <p>
                      {p.proposedVersions.length} {pluralize('entity', p.proposedVersions.length)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <GovernanceStatusChip date={p.createdAt} status="ACCEPTED" />

                <GovernanceProposalVoteState isEditor={editorsForSpace.isEditor} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

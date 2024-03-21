import { cookies } from 'next/headers';
import Link from 'next/link';
import pluralize from 'pluralize';

import React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Subgraph } from '~/core/io';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';

import { Avatar } from '~/design-system/avatar';

import { getIsEditorForSpace } from '../space-page/get-is-editor-for-space';
import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';

interface Props {
  spaceId: string;
  page: number;
}

export async function GovernanceProposalsList({ spaceId, page }: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;

  const [proposals, isEditor] = await Promise.all([
    Subgraph.fetchProposals({ spaceId, first: 5, page }),
    getIsEditorForSpace(spaceId, connectedAddress),
  ]);

  return (
    <div className="flex flex-col divide-y divide-grey-01">
      {proposals.map(p => {
        const changeCount = Action.getChangeCount(
          p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
        );

        return (
          <div key={p.id} className="w-full py-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-smallTitle">{p.name}</h3>
                <div className="flex items-center gap-5 text-breadcrumb text-grey-04">
                  <Link
                    href={p.createdBy?.profileLink ?? ''}
                    className="flex items-center gap-1.5 transition-colors duration-75 hover:text-text"
                  >
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar avatarUrl={p.createdBy.avatarUrl} value={p.createdBy.address} />
                    </div>
                    <p>{p.createdBy.name ?? p.createdBy.id}</p>
                  </Link>
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
                <div className="flex-[1]">
                  <GovernanceStatusChip date={p.createdAt} status="ACCEPTED" />
                </div>
                <GovernanceProposalVoteState isEditor={isEditor} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

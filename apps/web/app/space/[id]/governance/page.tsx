import * as React from 'react';

import { ServerSideEnvParams } from '~/core/types';

import { SpaceLayout } from '../space-layout';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams;
}

export default async function GovernancePage({ params, searchParams }: Props) {
  return (
    // @ts-expect-error async JSX function
    <SpaceLayout params={params} searchParams={searchParams}>
      <div className="flex items-center gap-5">
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Voting period</h2>
          <p className="text-mediumTitle">24h</p>
        </GovernanceMetadataBox>
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Pass threshold</h2>
          <p className="text-mediumTitle">51%</p>
        </GovernanceMetadataBox>
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Active proposals</h2>
          <p className="text-mediumTitle">0</p>
        </GovernanceMetadataBox>
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Accepted vs. rejected</h2>
          <p className="flex items-center gap-3 text-mediumTitle">
            <span>0</span>
            <div className="h-4 w-px bg-grey-02" />
            <span>0</span>
          </p>
        </GovernanceMetadataBox>
      </div>
    </SpaceLayout>
  );
}

function GovernanceMetadataBox({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full flex-col items-center gap-1 rounded border border-grey-02 py-3">{children}</div>;
}

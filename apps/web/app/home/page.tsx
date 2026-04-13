import * as Effect from 'effect/Effect';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchSidebarCounts } from '~/core/io/fetch-sidebar-counts';
import { getSpaces } from '~/core/io/queries';
import { fetchProfile } from '~/core/io/subgraph';

import { Component } from './component';
import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { getGovernanceHomeSpaceContext } from './governance-home-space-ids';

interface Props {
  searchParams: Promise<{
    proposalType?: 'membership' | 'content';
    tab?: string;
    proposalCategory?: string;
    proposalStatus?: string;
    space?: string;
  }>;
}

function parseCategory(raw?: string, legacy?: 'membership' | 'content'): GovernanceHomeReviewCategory {
  if (legacy === 'content') return 'knowledge';
  if (legacy === 'membership') return 'membership';
  const allowed: GovernanceHomeReviewCategory[] = ['all', 'knowledge', 'membership', 'settings'];
  if (raw && (allowed as string[]).includes(raw)) return raw as GovernanceHomeReviewCategory;
  return 'all';
}

function parseStatus(raw?: string): GovernanceHomeStatusFilter {
  const allowed: GovernanceHomeStatusFilter[] = ['pending', 'accepted', 'rejected'];
  if (raw && (allowed as string[]).includes(raw)) return raw as GovernanceHomeStatusFilter;
  return 'pending';
}

export default async function PersonalHomePage(props: Props) {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const sp = await props.searchParams;

  const person = connectedAddress ? await Effect.runPromise(fetchProfile(connectedAddress)) : null;

  const sidebarCounts = person?.spaceId ? await fetchSidebarCounts(person.spaceId) : undefined;

  const tab = sp.tab === 'my' ? 'my' : 'review';
  const proposalCategory = parseCategory(sp.proposalCategory, sp.proposalType);
  const proposalStatus = parseStatus(sp.proposalStatus);
  const governanceSpaceId = sp.space && sp.space !== 'all' ? sp.space : 'all';

  let editorSpaceOptions: { id: string; name: string }[] = [];
  let myProposalSpaceOptions: { id: string; name: string }[] = [];

  if (person?.spaceId) {
    const ctx = await getGovernanceHomeSpaceContext(person.spaceId);
    const [editorSpaces, mySpaces] = await Promise.all([
      ctx.editorIds.length ? Effect.runPromise(getSpaces({ spaceIds: ctx.editorIds })) : Promise.resolve([]),
      ctx.myProposalSpaceIds.length
        ? Effect.runPromise(getSpaces({ spaceIds: ctx.myProposalSpaceIds }))
        : Promise.resolve([]),
    ]);
    editorSpaceOptions = editorSpaces.map(s => ({
      id: s.id,
      name: s.entity?.name?.trim() || s.id.slice(0, 8),
    }));
    myProposalSpaceOptions = mySpaces.map(s => ({
      id: s.id,
      name: s.entity?.name?.trim() || s.id.slice(0, 8),
    }));
  }

  return (
    <Component
      header={<GovernanceHomeHeader />}
      proposalType={sp.proposalType}
      sidebarCounts={sidebarCounts}
      connectedAddress={connectedAddress}
      connectedSpaceId={person?.spaceId}
      governanceTab={tab}
      governanceFilters={{
        spaceId: governanceSpaceId,
        category: proposalCategory,
        status: proposalStatus,
      }}
      editorSpaceOptions={editorSpaceOptions}
      myProposalSpaceOptions={myProposalSpaceOptions}
      myProposalSpaceIds={myProposalSpaceOptions.map(s => s.id)}
    />
  );
}

export const metadata = {
  title: `Governance home`,
};

function GovernanceHomeHeader() {
  return (
    <div className="flex w-full items-center justify-between">
      <h1 className="text-mainPage text-text">Governance</h1>
    </div>
  );
}

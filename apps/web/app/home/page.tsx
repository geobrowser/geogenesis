import * as Effect from 'effect/Effect';
import { cookies } from 'next/headers';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { WALLET_ADDRESS } from '~/core/cookie';
import type { Space } from '~/core/io/dto/spaces';
import { fetchSidebarCounts } from '~/core/io/fetch-sidebar-counts';
import { getSpaces } from '~/core/io/queries';
import { fetchProfile } from '~/core/io/subgraph';
import { compareSpaceListOrderByRankNameId } from '~/core/utils/space/browse-space-list-sort';

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

type GovernanceSpaceOption = { id: string; name: string; image: string | null; unnamed: boolean };

function mapAndSortGovernanceSpaceOptions(spaces: Space[]): GovernanceSpaceOption[] {
  return spaces
    .map(s => {
      const rawName = s.entity?.name?.trim() ?? '';
      const unnamed = rawName.length === 0;
      return {
        id: s.id,
        name: unnamed ? s.id.slice(0, 8) : rawName,
        image: s.entity?.image && s.entity.image !== PLACEHOLDER_SPACE_IMAGE ? s.entity.image : null,
        unnamed,
      };
    })
    .sort(compareSpaceListOrderByRankNameId);
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

  let editorSpaceOptions: GovernanceSpaceOption[] = [];
  let myProposalSpaceOptions: GovernanceSpaceOption[] = [];

  if (person?.spaceId) {
    const ctx = await getGovernanceHomeSpaceContext(person.spaceId);
    const [editorSpaces, mySpaces] = await Promise.all([
      ctx.editorIds.length ? Effect.runPromise(getSpaces({ spaceIds: ctx.editorIds })) : Promise.resolve([]),
      ctx.myProposalSpaceIds.length
        ? Effect.runPromise(getSpaces({ spaceIds: ctx.myProposalSpaceIds }))
        : Promise.resolve([]),
    ]);
    editorSpaceOptions = mapAndSortGovernanceSpaceOptions(editorSpaces);
    myProposalSpaceOptions = mapAndSortGovernanceSpaceOptions(mySpaces);
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

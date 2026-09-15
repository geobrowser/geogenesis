import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { fetchProfilesBySpaceIds } from '~/core/io/subgraph';
import type { Profile } from '~/core/types';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { PersonProposalsTab } from '~/partials/profile/person-proposals-tab';

import { cachedFetchSpace } from '../../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Everything this person proposed, across every space (GEO-2859).
 *
 * Only on a personal space. A DAO space's own proposals are the governance tab's
 * job, and that one is scoped to the space — this one deliberately is not.
 */
export default async function ProposalsPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  if (space?.type !== 'PERSONAL') {
    notFound();
  }

  // One lookup for the page. Every row on it was proposed by the same person —
  // the one whose profile this is — so the byline is resolved here rather than
  // per row, and the rows carry no proposer of their own to disagree with it.
  const [proposer] = await Effect.runPromise(fetchProfilesBySpaceIds([params.id]));

  return (
    <EntityPageContentContainer>
      <PersonProposalsTab spaceId={params.id} proposer={proposer ?? fallbackProposer(params.id)} />
    </EntityPageContentContainer>
  );
}

/** Someone the graph has no profile row for yet. The rows still render, unnamed. */
function fallbackProposer(spaceId: string): Profile {
  return {
    id: spaceId,
    spaceId,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: spaceId as `0x${string}`,
    profileLink: null,
  };
}

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { fetchProfilesBySpaceIds } from '~/core/io/subgraph';
import { fallbackProposer } from '~/core/profile/profile-proposer';
import { Spaces } from '~/core/utils/space';

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

  // The layout gives this route its column and its rail, and it only does that
  // for a profile — a personal space with nobody on it would render the tab
  // into a stripped page. Same predicate, so the tab and the chrome agree.
  if (!Spaces.isPersonProfileSpace(space)) {
    notFound();
  }

  // One lookup for the page. Every row on it was proposed by the same person —
  // the one whose profile this is — so the byline is resolved here rather than
  // per row, and the rows carry no proposer of their own to disagree with it.
  const [proposer] = await Effect.runPromise(fetchProfilesBySpaceIds([params.id]));

  return <PersonProposalsTab spaceId={params.id} proposer={proposer ?? fallbackProposer(params.id)} />;
}

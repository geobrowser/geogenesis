'use client';

import * as React from 'react';

import type { Relation } from '~/core/types';

import { PersonRecordFeed } from '~/partials/profile/person-record-feed';

import { ClaimProvenance } from './claim-provenance';
import { getClaimSources } from './claim-sources';
import { useClaimExploreRows } from './use-claim-explore-rows';

/** Provenance plus the source entities themselves, rendered as the explore feed cards they use elsewhere. */
export function ClaimSourcesTab({
  claimId,
  claimRelations,
  spaceId,
}: {
  claimId: string;
  claimRelations: Relation[];
  spaceId: string;
}) {
  const sourceIds = React.useMemo(() => getClaimSources(claimRelations).map(source => source.id), [claimRelations]);
  const sources = useClaimExploreRows(sourceIds, spaceId);

  // The parent removes the Sources tab when this is empty. The route remains addressable directly,
  // matching the profile record-tab pattern, so a stale bookmark still gets an honest empty state.
  if (sourceIds.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">No sources have been linked to this claim yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ClaimProvenance claimId={claimId} claimRelations={claimRelations} spaceId={spaceId} />
      <PersonRecordFeed
        rows={sources.data ?? []}
        isLoading={sources.isLoading}
        isError={sources.isError}
        loadingLabel="Loading sources…"
        emptyLabel="No linked sources could be displayed."
        errorLabel="Couldn’t load sources."
        noun="sources"
      />
    </div>
  );
}

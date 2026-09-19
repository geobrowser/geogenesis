'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import type { Relation } from '~/core/types';
import { dedupeRelationsByToEntityId } from '~/core/utils/dedupe-relations';

import { PersonRecordFeed } from '~/partials/profile/person-record-feed';

import { ClaimProvenance } from './claim-provenance';

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
  const sourceIds = React.useMemo(
    () =>
      dedupeRelationsByToEntityId(
        claimRelations.filter(
          relation => relation.isDeleted !== true && ID.equals(relation.type.id, SOURCES_PROPERTY_ID)
        )
      ).map(relation => relation.toEntity.id),
    [claimRelations]
  );

  const sources = useQuery({
    queryKey: ['claim', ID.uuidToHex(claimId), 'sources', sourceIds.map(ID.uuidToHex)],
    queryFn: ({ signal }) => {
      const preferredSpaces = new Map(sourceIds.map(id => [ID.uuidToHex(id), [spaceId]]));
      return fetchExploreRowsByIds(sourceIds, signal, preferredSpaces);
    },
    enabled: sourceIds.length > 0,
    staleTime: 30_000,
  });

  // The parent removes the Sources tab when this is empty. Keep the panel empty too in case a
  // stale route or side-panel selection briefly asks for it while relations are changing.
  if (sourceIds.length === 0) return null;

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

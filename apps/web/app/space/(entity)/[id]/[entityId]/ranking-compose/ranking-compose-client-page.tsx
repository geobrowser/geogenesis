'use client';

import { useEffect } from 'react';

import { useSetAtom } from 'jotai';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { type RankingComposeMode } from '~/core/blocks/ranking/ranking-compose-url';
import { useRankingComposePage } from '~/core/blocks/ranking/use-ranking-compose-page';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';

import { RankingComposeScreen } from '~/partials/blocks/table/ranking-compose-screen';
import { RankingViewScreen } from '~/partials/blocks/table/ranking-view-screen';
import { type InitialGlobalRanking, type InitialSharedRanking } from '~/partials/blocks/table/use-ranking-block-state';

import { navbarSpaceOverrideAtom } from '~/atoms';

type Props = {
  spaceId: string;
  dataBlockEntityId: string;
  relationId: string;
  parentEntityIdParam: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  mode?: RankingComposeMode;
  rankEntityId?: string;
  authorSpaceId?: string;
  ogVersion?: string;
  initialGlobalRanking?: InitialGlobalRanking;
  initialSharedRanking?: InitialSharedRanking;
};

function RankingComposeLoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-lg text-text">{message}</p>
    </div>
  );
}

export function RankingComposeClientPage({
  spaceId,
  dataBlockEntityId,
  relationId,
  parentEntityIdParam,
  rankingStartDate = '',
  rankingEndDate = '',
  mode = 'edit',
  rankEntityId = '',
  authorSpaceId = '',
  ogVersion = '',
  initialGlobalRanking,
  initialSharedRanking,
}: Props) {
  const { hasValidParams, isLoading, parentEntityId, blocks, blockRelations } = useRankingComposePage({
    spaceId,
    blockEntityId: dataBlockEntityId,
    relationId,
    parentEntityIdParam,
  });

  // Short-link routes (/r/g, /r) have no space in the URL; surface it to the navbar.
  const setNavbarSpaceOverride = useSetAtom(navbarSpaceOverrideAtom);
  useEffect(() => {
    setNavbarSpaceOverride({ spaceId });
    return () => setNavbarSpaceOverride(null);
  }, [spaceId, setNavbarSpaceOverride]);

  // Seeded view pages render immediately instead of waiting on the client block
  // resolution; the live store reconciles in the background with no visible swap.
  const hasSeededRanking = mode === 'view' && (initialGlobalRanking != null || initialSharedRanking != null);

  if (!hasValidParams) {
    return <RankingComposeLoadingState message="Invalid parameters" />;
  }

  if (!parentEntityId) {
    return isLoading ? (
      <RankingComposeLoadingState message="Loading ranking..." />
    ) : (
      <RankingComposeLoadingState message="Data block not found" />
    );
  }

  if (isLoading && !hasSeededRanking) {
    return <RankingComposeLoadingState message="Loading ranking..." />;
  }

  return (
    <EntityStoreProvider id={parentEntityId} spaceId={spaceId}>
      <EditorProvider
        id={parentEntityId}
        spaceId={spaceId}
        initialBlocks={blocks}
        initialBlockRelations={blockRelations}
      >
        <DataBlockProvider spaceId={spaceId} entityId={dataBlockEntityId} relationId={relationId}>
          {mode === 'view' ? (
            <RankingViewScreen
              spaceId={spaceId}
              rankingStartDate={rankingStartDate}
              rankingEndDate={rankingEndDate}
              rankEntityId={rankEntityId}
              authorSpaceId={authorSpaceId}
              ogVersion={ogVersion}
              initialGlobalRanking={initialGlobalRanking}
              initialSharedRanking={initialSharedRanking}
            />
          ) : (
            <RankingComposeScreen
              spaceId={spaceId}
              rankingStartDate={rankingStartDate}
              rankingEndDate={rankingEndDate}
            />
          )}
        </DataBlockProvider>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

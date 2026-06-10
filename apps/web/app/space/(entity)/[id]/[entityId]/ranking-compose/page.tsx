'use client';

import { useParams, useSearchParams } from 'next/navigation';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { type RankingComposeMode } from '~/core/blocks/ranking/ranking-compose-url';
import { useRankingComposePage } from '~/core/blocks/ranking/use-ranking-compose-page';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';

import { RankingComposeScreen } from '~/partials/blocks/table/ranking-compose-screen';
import { RankingViewScreen } from '~/partials/blocks/table/ranking-view-screen';

function RankingComposeLoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-lg text-text">{message}</p>
    </div>
  );
}

export default function RankingComposePage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const spaceId = params?.id as string;
  const dataBlockEntityId = params?.entityId as string;
  const relationId = searchParams?.get('relationId') ?? '';
  const parentEntityIdParam = searchParams?.get('parentEntityId') ?? '';
  const rankingStartDate = searchParams?.get('rankingStartDate') ?? '';
  const rankingEndDate = searchParams?.get('rankingEndDate') ?? '';
  const mode: RankingComposeMode = searchParams?.get('mode') === 'view' ? 'view' : 'edit';

  const { hasValidParams, isLoading, parentEntityId, blocks, blockRelations } = useRankingComposePage({
    spaceId,
    blockEntityId: dataBlockEntityId,
    relationId,
    parentEntityIdParam,
  });

  if (!hasValidParams) {
    return <RankingComposeLoadingState message="Invalid parameters" />;
  }

  if (isLoading) {
    return <RankingComposeLoadingState message="Loading ranking…" />;
  }

  if (!parentEntityId) {
    return <RankingComposeLoadingState message="Data block not found" />;
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
            <RankingViewScreen spaceId={spaceId} rankingStartDate={rankingStartDate} rankingEndDate={rankingEndDate} />
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

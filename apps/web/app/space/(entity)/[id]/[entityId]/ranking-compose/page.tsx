'use client';

import { useParams, useSearchParams } from 'next/navigation';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useDataBlockChildPage } from '~/core/blocks/data/use-data-block-child-page';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';

import { RankingComposeScreen } from '~/partials/blocks/table/ranking-compose-screen';

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
  const pageEntityId = params?.entityId as string;
  const dataBlockEntityId = searchParams?.get('blockEntityId') ?? pageEntityId;
  const relationId = searchParams?.get('relationId') ?? '';
  const rankingStartDate = searchParams?.get('rankingStartDate') ?? '';
  const rankingEndDate = searchParams?.get('rankingEndDate') ?? '';

  const { hasValidParams, isLoading, parentEntityId, blocks, blockRelations } = useDataBlockChildPage({
    spaceId,
    dataBlockEntityId,
    relationId,
  });

  const hostEntityId = parentEntityId ?? pageEntityId;

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
    <EntityStoreProvider id={hostEntityId} spaceId={spaceId}>
      <EditorProvider id={hostEntityId} spaceId={spaceId} initialBlocks={blocks} initialBlockRelations={blockRelations}>
        <DataBlockProvider spaceId={spaceId} entityId={dataBlockEntityId} relationId={relationId}>
          <RankingComposeScreen spaceId={spaceId} rankingStartDate={rankingStartDate} rankingEndDate={rankingEndDate} />
        </DataBlockProvider>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

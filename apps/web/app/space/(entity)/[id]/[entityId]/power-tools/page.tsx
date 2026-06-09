'use client';

import { useParams, useSearchParams } from 'next/navigation';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useDataBlockChildPage } from '~/core/blocks/data/use-data-block-child-page';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';

import { PowerToolsScreen } from '~/partials/power-tools/power-tools-screen';

export default function PowerToolsPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const spaceId = params?.id as string;
  const dataBlockEntityId = params?.entityId as string;
  const relationId = searchParams?.get('relationId') ?? '';
  const parentEntityIdParam = searchParams?.get('parentEntityId') ?? '';

  const { hasValidParams, isLoading, parentEntityId, blocks, blockRelations } = useDataBlockChildPage({
    spaceId,
    dataBlockEntityId,
    relationId,
    parentEntityIdParam,
  });

  if (!hasValidParams) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Invalid parameters</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading Power Tools...</div>
      </div>
    );
  }

  if (!parentEntityId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Data block not found</div>
      </div>
    );
  }

  return (
    <EntityStoreProvider id={parentEntityId} spaceId={spaceId}>
      <EditorProvider
        id={parentEntityId}
        spaceId={spaceId}
        initialBlocks={blocks ?? []}
        initialBlockRelations={blockRelations}
      >
        <DataBlockProvider spaceId={spaceId} entityId={dataBlockEntityId} relationId={relationId}>
          <PowerToolsScreen />
        </DataBlockProvider>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

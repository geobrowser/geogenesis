'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { BlockMediaFrame } from '~/core/hooks/use-block-media-dimensions';
import type { Entity, Relation } from '~/core/types';

import type { ServerBlock } from '~/partials/editor/server-content';

import type { DataBlockView } from '../../blocks/data/data-block-view';

export type DataBlockPlaceholderSizing = {
  view: DataBlockView;
  pageSize?: number;
  itemCount?: number;
  mediaFrame?: BlockMediaFrame;
};

export function placeholderCollectionItemCount({
  blockId,
  isQuerySource,
  initialBlockEntities,
  relations,
}: {
  blockId: string;
  isQuerySource: boolean;
  initialBlockEntities: Pick<Entity, 'id'>[];
  relations: Relation[];
}): number | undefined {
  if (isQuerySource || !initialBlockEntities.some(entity => entity.id === blockId)) return undefined;
  return relations.filter(
    r => r.fromEntity.id === blockId && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE && !r.isDeleted
  ).length;
}

const DataBlockPlaceholderSizingContext = React.createContext<Map<string, DataBlockPlaceholderSizing> | null>(null);

/** A blockId -> sizing map, built once so each data node reads its sizing instead of rebuilding it. */
export function buildDataBlockPlaceholderSizingMap(
  blockIds: string[],
  serverBlocks: ServerBlock[]
): Map<string, DataBlockPlaceholderSizing> {
  const map = new Map<string, DataBlockPlaceholderSizing>();
  blockIds.forEach((blockId, index) => {
    const server = serverBlocks[index];
    if (server?.type !== 'data') return;
    map.set(blockId, {
      view: server.view ?? 'TABLE',
      pageSize: server.pageSize,
      itemCount: server.itemCount,
      mediaFrame: server.mediaFrame,
    });
  });
  return map;
}

export function DataBlockPlaceholderSizingProvider({
  sizing,
  children,
}: {
  sizing: Map<string, DataBlockPlaceholderSizing>;
  children: React.ReactNode;
}) {
  return (
    <DataBlockPlaceholderSizingContext.Provider value={sizing}>{children}</DataBlockPlaceholderSizingContext.Provider>
  );
}

export function useDataBlockPlaceholderSizing(blockId: string): DataBlockPlaceholderSizing | undefined {
  return React.useContext(DataBlockPlaceholderSizingContext)?.get(blockId);
}

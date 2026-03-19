'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { OmitStrict } from '~/core/types';
import { Entity, Relation } from '~/core/types';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { EntityId } from '../../io/substream-schema';
import { validateEntityId } from '../../utils/utils';
import { RelationWithBlock, useBlocks } from './use-blocks';

const EditorContext = React.createContext<OmitStrict<EditorProviderProps, 'children'> | null>(null);

export type Tabs = Record<string, { entity: Entity; blocks: Entity[] }>;

type EditorProviderProps = {
  id: string;
  spaceId: string;
  initialBlocks: Entity[];
  initialBlockRelations: Relation[];
  initialTabs?: Tabs;
  initialCollectionItems?: Record<string, Entity[]>;
  children: React.ReactNode;
};

export const EditorProvider = ({
  id,
  spaceId,
  initialBlocks,
  initialBlockRelations,
  initialTabs,
  initialCollectionItems,
  children,
}: EditorProviderProps) => {
  const { store } = useSyncEngine();

  React.useEffect(() => {
    const entities: Entity[] = [];

    entities.push(...initialBlocks);

    if (initialTabs) {
      for (const tab of Object.values(initialTabs)) {
        entities.push(tab.entity);
        entities.push(...tab.blocks);
      }
    }

    if (initialCollectionItems) {
      for (const items of Object.values(initialCollectionItems)) {
        entities.push(...items);
      }
    }

    const byId = new Map<string, Entity>();
    for (const e of entities) {
      if (!e?.id) continue;
      if (!byId.has(e.id)) byId.set(e.id, e);
    }

    const unique = [...byId.values()];
    if (unique.length > 0) {
      store.hydrateWith(unique);
    }
  }, [store, initialBlocks, initialTabs, initialCollectionItems]);

  const value = React.useMemo(() => {
    return {
      id,
      spaceId,
      initialBlockRelations,
      initialBlocks,
      initialTabs,
      initialCollectionItems,
    };
  }, [id, spaceId, initialBlockRelations, initialBlocks, initialTabs, initialCollectionItems]);

  return (
    <EditorContext.Provider value={value}>
      <EditorBlocksProvider>{children}</EditorBlocksProvider>
    </EditorContext.Provider>
  );
};

export function useEditorInstance() {
  const value = React.useContext(EditorContext);

  if (!value) {
    throw new Error(`Missing EditorProvider`);
  }

  return value;
}

type EditorBlocksState = {
  blockRelations: RelationWithBlock[];
  initialBlockEntities: Entity[];
  initialCollectionItems: Record<string, Entity[]>;
};

const EditorBlocksContext = React.createContext<EditorBlocksState | null>(null);

function useTabIdFromSearchParams() {
  const searchParams = useSearchParams();
  const maybeTabId = searchParams?.get('tabId');
  if (!validateEntityId(maybeTabId)) return null;
  return maybeTabId;
}

function EditorBlocksProvider({ children }: { children: React.ReactNode }) {
  const {
    id: entityId,
    spaceId,
    initialBlockRelations,
    initialBlocks,
    initialTabs,
    initialCollectionItems: allCollectionItems,
  } = useEditorInstance();

  const tabId = useTabIdFromSearchParams();
  const activeEntityId = tabId ?? entityId;
  const isTab = React.useMemo(() => tabId && !!initialTabs && Object.hasOwn(initialTabs, tabId), [initialTabs, tabId]);

  const blockRelations = useBlocks(
    activeEntityId,
    spaceId,
    isTab ? initialTabs![tabId as EntityId].entity.relations : initialBlockRelations
  );

  const initialBlockEntities = React.useMemo(() => {
    return isTab ? initialTabs![tabId as EntityId].blocks : initialBlocks;
  }, [initialBlocks, initialTabs, isTab, tabId]);

  const value = React.useMemo(
    () => ({ blockRelations, initialBlockEntities, initialCollectionItems: allCollectionItems ?? {} }),
    [blockRelations, initialBlockEntities, allCollectionItems]
  );

  return <EditorBlocksContext.Provider value={value}>{children}</EditorBlocksContext.Provider>;
}

export function useEditorBlocks() {
  const value = React.useContext(EditorBlocksContext);

  if (!value) {
    throw new Error(`Missing EditorBlocksProvider`);
  }

  return value;
}

'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { useRelations } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { OmitStrict } from '~/core/types';
import { Entity, Relation } from '~/core/types';

import { validateEntityId } from '../../utils/utils';
import { EntitySidePanelActiveTabContext } from '../entity-side-panel-active-tab';
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
  ignoreRouteTabId?: boolean;
  children: React.ReactNode;
};

export const EditorProvider = ({
  id,
  spaceId,
  initialBlocks,
  initialBlockRelations,
  initialTabs,
  initialCollectionItems,
  ignoreRouteTabId = false,
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
      ignoreRouteTabId,
    };
  }, [id, spaceId, initialBlockRelations, initialBlocks, initialTabs, initialCollectionItems, ignoreRouteTabId]);

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

const EditorResolvedTabContext = React.createContext<string | null | undefined>(undefined);

function useTabIdFromSearchParams() {
  const searchParams = useSearchParams();
  const maybeTabId = searchParams?.get('tabId');
  if (!validateEntityId(maybeTabId)) return null;
  return maybeTabId;
}

/**
 * main-page URL tab while a different entity is open in the side panel).
 */
export function resolveEditorTabId(
  urlTabId: string | null,
  initialTabs: Tabs | undefined,
  liveTabEntityIds?: ReadonlySet<string>
): string | null {
  if (!urlTabId) return null;
  if (initialTabs && Object.hasOwn(initialTabs, urlTabId)) return urlTabId;
  if (liveTabEntityIds?.has(urlTabId)) return urlTabId;
  return null;
}

export function useActiveTabIdForEditor(): string | null {
  const resolved = React.useContext(EditorResolvedTabContext);
  if (resolved !== undefined) {
    return resolved;
  }

  const urlTabId = useTabIdFromSearchParams();
  const editor = React.useContext(EditorContext);
  if (!editor) return urlTabId;
  return resolveEditorTabId(urlTabId, editor.initialTabs);
}

function EditorBlocksProvider({ children }: { children: React.ReactNode }) {
  const {
    id: entityId,
    spaceId,
    initialBlockRelations,
    initialBlocks,
    initialTabs,
    initialCollectionItems: allCollectionItems,
    ignoreRouteTabId,
  } = useEditorInstance();

  const sidePanelTabCtx = React.useContext(EntitySidePanelActiveTabContext);
  const urlTabId = ignoreRouteTabId ? null : useTabIdFromSearchParams();

  const liveTabRelations = useRelations({
    selector: r =>
      r.fromEntity.id === entityId && r.type.id === SystemIds.TABS_PROPERTY && r.spaceId === spaceId && !r.isDeleted,
  });

  const liveTabEntityIds = React.useMemo(() => new Set(liveTabRelations.map(r => r.toEntity.id)), [liveTabRelations]);

  const tabId = React.useMemo(() => {
    if (sidePanelTabCtx) {
      const requested = sidePanelTabCtx.activeTabId;
      if (!requested) return null;
      return resolveEditorTabId(requested, initialTabs, liveTabEntityIds) ?? requested;
    }
    return resolveEditorTabId(urlTabId, initialTabs, liveTabEntityIds);
  }, [sidePanelTabCtx, urlTabId, initialTabs, liveTabEntityIds]);

  const activeEntityId = tabId ?? entityId;
  const isTab =
    tabId != null &&
    tabId !== entityId &&
    ((initialTabs != null && Object.hasOwn(initialTabs, tabId)) ||
      liveTabEntityIds.has(tabId) ||
      sidePanelTabCtx?.activeTabId === tabId);
  const tabSnapshot =
    isTab && tabId && initialTabs && Object.hasOwn(initialTabs, tabId) ? initialTabs[tabId] : undefined;

  const blockRelations = useBlocks(
    activeEntityId,
    spaceId,
    isTab ? (tabSnapshot?.entity.relations ?? []) : initialBlockRelations
  );

  const initialBlockEntities = React.useMemo(() => {
    return isTab ? (tabSnapshot?.blocks ?? []) : initialBlocks;
  }, [initialBlocks, isTab, tabSnapshot]);

  const value = React.useMemo(
    () => ({ blockRelations, initialBlockEntities, initialCollectionItems: allCollectionItems ?? {} }),
    [blockRelations, initialBlockEntities, allCollectionItems]
  );

  return (
    <EditorResolvedTabContext.Provider value={tabId}>
      <EditorBlocksContext.Provider value={value}>{children}</EditorBlocksContext.Provider>
    </EditorResolvedTabContext.Provider>
  );
}

export function useEditorBlocks() {
  const value = React.useContext(EditorBlocksContext);

  if (!value) {
    throw new Error(`Missing EditorBlocksProvider`);
  }

  return value;
}

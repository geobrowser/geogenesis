'use client';

import * as React from 'react';

import { OmitStrict } from '~/core/types';
import { Entity, Relation } from '~/core/types';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { DataBlockGateProvider } from '~/partials/editor/data-block-gate';

const EditorContext = React.createContext<OmitStrict<EditorProviderProps, 'children'> | null>(null);

export type Tabs = Record<string, { entity: Entity; blocks: Entity[] }>;

type EditorProviderProps = {
  id: string;
  spaceId: string;
  initialBlocks: Entity[];
  initialBlockRelations: Relation[];
  initialTabs?: Tabs;
  children: React.ReactNode;
};

export const EditorProvider = ({
  id,
  spaceId,
  initialBlocks,
  initialBlockRelations,
  initialTabs,
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

    const byId = new Map<string, Entity>();
    for (const e of entities) {
      if (!e?.id) continue;
      if (!byId.has(e.id)) byId.set(e.id, e);
    }

    const unique = [...byId.values()];
    if (unique.length > 0) {
      store.hydrateWith(unique);
    }
  }, [store, initialBlocks, initialTabs]);

  const value = React.useMemo(() => {
    return {
      id,
      spaceId,
      initialBlockRelations,
      initialBlocks,
      initialTabs,
    };
  }, [id, spaceId, initialBlockRelations, initialBlocks, initialTabs]);

  return (
    <EditorContext.Provider value={value}>
      <DataBlockGateProvider>{children}</DataBlockGateProvider>
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

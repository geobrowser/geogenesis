'use client';

import * as React from 'react';

import { OmitStrict } from '~/core/types';
import { Entity, Relation } from '~/core/types';

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

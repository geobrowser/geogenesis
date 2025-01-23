'use client';

import * as React from 'react';

import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { OmitStrict, Relation, SpaceId } from '~/core/types';

const EditorContext = React.createContext<OmitStrict<EditorProviderProps, 'children'> | null>(null);

export type Tabs = Record<EntityId, { entity: Entity; blocks: Entity[] }>;

type EditorProviderProps = {
  id: string;
  spaceId: SpaceId;
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

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorInstance() {
  const value = React.useContext(EditorContext);

  if (!value) {
    throw new Error(`Missing EditorProvider`);
  }

  return value;
}

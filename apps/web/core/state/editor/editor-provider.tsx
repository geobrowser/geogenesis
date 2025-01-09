'use client';

import * as React from 'react';

import { Entity } from '~/core/io/dto/entities';
import { OmitStrict, Relation, SpaceId } from '~/core/types';

const EditorContext = React.createContext<OmitStrict<Props, 'children'> | null>(null);

interface Props {
  id: string;
  spaceId: SpaceId;
  initialBlocks: Entity[];
  initialBlockRelations: Relation[];
  children: React.ReactNode;
}

export const EditorProvider = ({ id, spaceId, initialBlocks, initialBlockRelations, children }: Props) => {
  const value = React.useMemo(() => {
    return {
      id,
      spaceId,
      initialBlockRelations,
      initialBlocks,
    };
  }, [id, spaceId, initialBlockRelations, initialBlocks]);

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorInstance() {
  const value = React.useContext(EditorContext);

  if (!value) {
    throw new Error(`Missing EditorProvider`);
  }

  return value;
}

import * as React from 'react';
import { useMemo } from 'react';
import { mergeAttributes, Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import { Triple } from '~/modules/types';
import { EntityPageTableBlockStoreProvider } from './blocks/table/entity-page-table-block-store-provider';
import { TableBlock } from './blocks/table/table-block';
import { useTypesStore } from '~/modules/types/types-store';

export const TableNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  spanning: false,
  allowGapCursor: false,
  defining: true,
  exitable: true,

  parseHTML() {
    return [
      {
        tag: 'table-node',
      },
    ];
  },

  addAttributes() {
    return {
      typeId: {
        default: null,
      },
      typeName: {
        default: null,
      },
      spaceId: {
        default: '',
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['table-node', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableNodeComponent);
  },
});

function TableNodeComponent({ node }: NodeViewRendererProps) {
  const { spaceId, typeId } = node.attrs;
  const { types } = useTypesStore();

  const selectedType = useMemo(() => {
    return types.find(type => type.entityId === typeId) as Triple;
  }, [JSON.stringify(types), typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  console.log('types', types);
  console.log('selectedType', selectedType);
  console.log('typeId', typeId);

  return (
    <NodeViewWrapper>
      <div contentEditable="false">
        <TableNodeChildren spaceId={spaceId} selectedType={selectedType} />
      </div>
    </NodeViewWrapper>
  );
}

function TableNodeChildren({ spaceId, selectedType }: { spaceId: string; selectedType: Triple }) {
  return (
    <EntityPageTableBlockStoreProvider spaceId={spaceId} initialSelectedType={selectedType}>
      <TableBlock spaceId={spaceId} />
    </EntityPageTableBlockStoreProvider>
  );
}

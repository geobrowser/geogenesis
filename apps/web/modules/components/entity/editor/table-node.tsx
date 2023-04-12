import * as React from 'react';
import { useMemo } from 'react';
import { mergeAttributes, Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import { Triple } from '~/modules/types';
import { TableBlockStoreProvider } from './blocks/table/table-block-store-provider';
import { TableBlock } from './blocks/table/table-block';
import { useTypesStore } from '~/modules/type/types-store';

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
  const { spaceId, typeId, id } = node.attrs;
  const { types } = useTypesStore();

  const selectedType = useMemo(() => {
    return types.find(type => type.entityId === typeId) as Triple;
  }, [JSON.stringify(types), typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <NodeViewWrapper>
      <div contentEditable="false">
        <TableNodeChildren spaceId={spaceId} selectedType={selectedType} entityId={id} />
      </div>
    </NodeViewWrapper>
  );
}

function TableNodeChildren({
  spaceId,
  selectedType,
  entityId,
}: {
  spaceId: string;
  selectedType: Triple;
  entityId: string;
}) {
  return (
    <TableBlockStoreProvider spaceId={spaceId} entityId={entityId} selectedType={selectedType}>
      <TableBlock spaceId={spaceId} entityId={entityId} />
    </TableBlockStoreProvider>
  );
}

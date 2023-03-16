import { mergeAttributes, Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';
import { EntityTableStoreProvider, useEntityTable } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { EntityTableContainer } from '../../entity-table/entity-table-container';

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

export const TableNodeComponent = React.memo(function TableNodeComponent({ node }: NodeViewRendererProps) {
  const { spaceId, typeId } = node.attrs;

  /* Warning: A bit unwieldy, but less code needed: useEntityTable pulls from the parent EntityTableStoreProvider context which contains all of the types  */
  const { types } = useEntityTable();
  const selectedType = types.find(type => type.entityId === typeId) as Triple;

  return (
    <NodeViewWrapper className="react-component-with-content">
      <div contentEditable="false">
        <EntityTableStoreProvider spaceId={spaceId} initialSelectedType={selectedType}>
          <EntityTableContainer showHeader={false} spaceId={spaceId} spaceName={''} />
        </EntityTableStoreProvider>
      </div>
    </NodeViewWrapper>
  );
});

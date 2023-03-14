import { mergeAttributes, Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';
import { EntityTableStoreProvider } from '~/modules/entity';
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
      selectedType: {
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
  const { spaceId, selectedType } = node.attrs;

  return (
    <NodeViewWrapper className="react-component-with-content">
      <div contentEditable="false">
        <EntityTableStoreProvider spaceId={spaceId} initialSelectedType={selectedType}>
          <EntityTableContainer showHeader={false} spaceId={spaceId} spaceName={'spaceName'} />
        </EntityTableStoreProvider>
      </div>
    </NodeViewWrapper>
  );
});

import { mergeAttributes, Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import React, { useMemo } from 'react';
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

export const TableNodeComponent = function TableNodeComponent({ node }: NodeViewRendererProps) {
  const { spaceId, typeId } = node.attrs;

  const { types } = useEntityTable();

  const selectedType = useMemo(() => {
    return types.find(type => type.entityId === typeId) as Triple;
  }, [JSON.stringify(types), typeId]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Setting "types.length" rather than types as a dependency to prevent excessive rerendering */

  return (
    <NodeViewWrapper className="react-component-with-content">
      <div contentEditable="false">
        <TableNodeChildren spaceId={spaceId} selectedType={selectedType} />
      </div>
    </NodeViewWrapper>
  );
};

export const TableNodeChildren = React.memo(function TableNodeComponent({
  spaceId,
  selectedType,
}: {
  spaceId: string;
  selectedType: Triple;
}) {
  return (
    <EntityTableStoreProvider spaceId={spaceId} initialSelectedType={selectedType}>
      <EntityTableContainer showHeader={false} spaceId={spaceId} spaceName={''} />
    </EntityTableStoreProvider>
  );
});

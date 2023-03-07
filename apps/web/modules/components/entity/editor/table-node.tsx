import { mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';
import { EntityTableStoreProvider } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { EntityTableContainer } from '../../entity-table/entity-table-container';

export const TableNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  spanning: false,
  exitable: true,

  parseHTML() {
    return [
      {
        tag: 'table-node',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table-node', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableNodeComponent);
  },
});

const spaceId = `0xb5E2cD8A5F88517d3576ba99d52C005b19351A43`;

const initialSelectedType: Triple = {
  id: '0xb5E2cD8A5F88517d3576ba99d52C005b19351A43:fec429e7-0f17-4dd4-a39e-2e60f91fcd5d:type:d7ab4092-0ab5-441e-88c3-5c27952de773',
  entityId: 'fec429e7-0f17-4dd4-a39e-2e60f91fcd5d',
  entityName: 'Place',
  attributeId: 'type',
  attributeName: 'Types',
  value: {
    type: 'entity',
    id: 'd7ab4092-0ab5-441e-88c3-5c27952de773',
    name: 'Type',
  },
  space: '0xb5E2cD8A5F88517d3576ba99d52C005b19351A43',
};

export const TableNodeComponent = React.memo(function TableNodeComponent() {
  return (
    <NodeViewWrapper className="react-component-with-content">
      <EntityTableStoreProvider
        spaceId={''}
        initialRows={[]}
        initialSelectedType={initialSelectedType}
        initialColumns={[]}
        initialTypes={[]}
      >
        <EntityTableContainer
          showHeader={false}
          spaceId={spaceId}
          spaceName={'spaceName'}
          initialColumns={[]}
          initialRows={[]}
        />
      </EntityTableStoreProvider>
    </NodeViewWrapper>
  );
});

import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { EntityTableStoreProvider } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { EntityTableContainer } from '../../entity-table/entity-table-container';

export const ReactComponent = Node.create({
  name: 'reactComponent',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'react-component',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['react-component', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(Component);
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

export const Component = () => {
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
      <NodeViewContent className="content" />
    </NodeViewWrapper>
  );
};

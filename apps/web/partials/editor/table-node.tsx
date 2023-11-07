import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';
import { useMemo } from 'react';

import { TableBlockStoreProvider } from '~/core/state/table-block-store';
import { TableBlockProvider } from '~/core/state/table-block-store-v2';
import { useTypesStore } from '~/core/state/types-store/types-store';
import { GeoType } from '~/core/types';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

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
    return types.find(type => type.entityId === typeId);
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
  selectedType?: GeoType;
  entityId: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <>
          <TableBlockError spaceId={spaceId} blockId={entityId} />
        </>
      }
    >
      <TableBlockStoreProvider spaceId={spaceId} entityId={entityId} selectedType={selectedType}>
        <TableBlockProvider spaceId={spaceId} entityId={entityId} selectedType={selectedType}>
          <TableBlock spaceId={spaceId} />
        </TableBlockProvider>
      </TableBlockStoreProvider>
    </ErrorBoundary>
  );
}

import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';
import { useMemo } from 'react';

import { TableBlockProvider } from '~/core/state/table-block-store';

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

  return (
    <NodeViewWrapper>
      <div contentEditable="false">
        <TableNodeChildren spaceId={spaceId} entityId={id} typeId={typeId} />
      </div>
    </NodeViewWrapper>
  );
}

function TableNodeChildren({ spaceId, entityId, typeId }: { spaceId: string; entityId: string; typeId: string }) {
  // @TODO: Fetch the type with the space and name
  const selectedType = useMemo(() => {
    return {
      entityId: typeId,
      entityName: '',
      space: '',
    };
  }, [typeId]);

  return (
    <ErrorBoundary
      fallback={
        <>
          <TableBlockError spaceId={spaceId} blockId={entityId} />
        </>
      }
    >
      <TableBlockProvider spaceId={spaceId} entityId={entityId} selectedType={selectedType}>
        <TableBlock spaceId={spaceId} />
      </TableBlockProvider>
    </ErrorBoundary>
  );
}

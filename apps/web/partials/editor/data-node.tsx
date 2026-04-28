import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

export type TableNodeInitialDataSource = 'COLLECTION' | 'QUERY';

export const DataNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  allowGapCursor: false,
  defining: true,

  addAttributes() {
    return {
      initialDataSource: {
        default: null as TableNodeInitialDataSource | null,
      },
      querySetupCompleted: {
        default: null as boolean | null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'table-node',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table-node', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataNodeComponent);
  },
});

type DataNodeComponentProps = NodeViewRendererProps & {
  updateAttributes: (attributes: Record<string, unknown>) => void;
};

function DataNodeComponent({ node, updateAttributes }: DataNodeComponentProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  const { blockRelations } = useEditorStoreLite();
  const relation = blockRelations.find(b => b.block.id === id);
  const querySetupPending =
    node.attrs.initialDataSource === 'QUERY' && node.attrs.querySetupCompleted === false;

  const onCompleteQuerySetup = () => {
    updateAttributes({ querySetupCompleted: true });
  };

  return (
    <NodeViewWrapper>
      <div contentEditable="false" suppressContentEditableWarning={true} className="data-node">
        <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={id} />} onError={reportBoundaryError}>
          <DataBlockProvider spaceId={spaceId} entityId={id} relationId={relation?.entityId ?? ''}>
            <TableBlock
              spaceId={spaceId}
              blockId={id}
              querySetupPending={querySetupPending}
              onCompleteQuerySetup={onCompleteQuerySetup}
            />
          </DataBlockProvider>
        </ErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}

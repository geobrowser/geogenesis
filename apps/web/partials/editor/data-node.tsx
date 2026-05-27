import type { NodeViewProps } from '@tiptap/core';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';

import cx from 'classnames';
import { useAtomValue } from 'jotai';
import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { activeDataBlockIdAtom } from '~/atoms';
import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

export type TableNodeInitialDataSource = 'COLLECTION' | 'QUERY';

export const DataNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  allowGapCursor: true,
  defining: true,

  addKeyboardShortcuts() {
    return {
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'tableNode') {
          return false;
        }

        const pos = selection.from;
        if (pos <= 0) return false;

        return editor.commands.setTextSelection(pos - 1);
      },
      ArrowDown: ({ editor }) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'tableNode') {
          return false;
        }

        const pos = selection.to;
        if (pos >= editor.state.doc.content.size) return false;

        return editor.commands.setTextSelection(pos);
      },
    };
  },

  addAttributes() {
    return {
      initialDataSource: {
        default: null as TableNodeInitialDataSource | null,
      },
      querySetupCompleted: {
        default: null as boolean | null,
      },
      filtersOpenOnCreate: {
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

function DataNodeComponent({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { spaceId } = useEditorInstance();
  const isEditing = useUserIsEditing(spaceId);
  const { id } = node.attrs;
  const activeDataBlockId = useAtomValue(activeDataBlockIdAtom);
  const showSelected = isEditing && activeDataBlockId === id;

  const { blockRelations } = useEditorStoreLite();
  const relation = blockRelations.find(b => b.block.id === id);

  const [querySetupCompletedOptimistic, setQuerySetupCompletedOptimistic] = React.useState(false);

  React.useEffect(() => {
    setQuerySetupCompletedOptimistic(false);
  }, [id]);

  React.useEffect(() => {
    const persisted =
      node.attrs.querySetupCompleted === true || node.attrs.querySetupCompleted === 'true';
    if (persisted) {
      setQuerySetupCompletedOptimistic(false);
    }
  }, [node.attrs.querySetupCompleted]);

  const explicitQuerySetupIncomplete =
    node.attrs.querySetupCompleted === false || node.attrs.querySetupCompleted === 'false';

  const isQuerySetupDone =
    querySetupCompletedOptimistic ||
    node.attrs.querySetupCompleted === true ||
    node.attrs.querySetupCompleted === 'true' ||
    !explicitQuerySetupIncomplete;

  const querySetupPending = node.attrs.initialDataSource === 'QUERY' && !isQuerySetupDone;

  const onCompleteQuerySetup = () => {
    setQuerySetupCompletedOptimistic(true);
    updateAttributes({ querySetupCompleted: true });
  };

  return (
    <NodeViewWrapper data-selected={showSelected ? 'true' : undefined}>
      <div
        data-block-id={id}
        contentEditable="false"
        suppressContentEditableWarning={true}
        className={cx('data-node', showSelected && 'data-node-selected')}
      >
        <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={id} />} onError={reportBoundaryError}>
          <DataBlockProvider
            spaceId={spaceId}
            entityId={id}
            relationId={relation?.entityId ?? ''}
            onRemoveFromEditor={deleteNode}
          >
            <TableBlock
              spaceId={spaceId}
              blockId={id}
              querySetupPending={querySetupPending}
              onCompleteQuerySetup={onCompleteQuerySetup}
              initialFiltersOpen={
                node.attrs.filtersOpenOnCreate === true || node.attrs.filtersOpenOnCreate === 'true'
              }
              onConsumedInitialFiltersOpen={() => updateAttributes({ filtersOpenOnCreate: false })}
            />
          </DataBlockProvider>
        </ErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}

import type { NodeViewProps } from '@tiptap/core';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

export type TableNodeInitialDataSource = 'COLLECTION' | 'QUERY' | 'RANKING';

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
      filtersOpenOnCreate: {
        default: null as boolean | null,
      },
      rankingSetupCompleted: {
        default: null as boolean | null,
      },
      rankingStartDate: {
        default: null as string | null,
      },
      rankingEndDate: {
        default: null as string | null,
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

function DataNodeComponent({ node, updateAttributes }: NodeViewProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  const { blockRelations } = useEditorStoreLite();
  const relation = blockRelations.find(b => b.block.id === id);

  const [querySetupCompletedOptimistic, setQuerySetupCompletedOptimistic] = React.useState(false);
  const [rankingSetupCompletedOptimistic, setRankingSetupCompletedOptimistic] = React.useState(false);

  React.useEffect(() => {
    setQuerySetupCompletedOptimistic(false);
    setRankingSetupCompletedOptimistic(false);
  }, [id]);

  React.useEffect(() => {
    const persisted = node.attrs.querySetupCompleted === true || node.attrs.querySetupCompleted === 'true';
    if (persisted) {
      setQuerySetupCompletedOptimistic(false);
    }
  }, [node.attrs.querySetupCompleted]);

  React.useEffect(() => {
    const persisted = node.attrs.rankingSetupCompleted === true || node.attrs.rankingSetupCompleted === 'true';
    if (persisted) {
      setRankingSetupCompletedOptimistic(false);
    }
  }, [node.attrs.rankingSetupCompleted]);

  const explicitQuerySetupIncomplete =
    node.attrs.querySetupCompleted === false || node.attrs.querySetupCompleted === 'false';

  const isQuerySetupDone =
    querySetupCompletedOptimistic ||
    node.attrs.querySetupCompleted === true ||
    node.attrs.querySetupCompleted === 'true' ||
    !explicitQuerySetupIncomplete;

  const querySetupPending = node.attrs.initialDataSource === 'QUERY' && !isQuerySetupDone;

  const isRankingSetupDone =
    rankingSetupCompletedOptimistic ||
    node.attrs.rankingSetupCompleted === true ||
    node.attrs.rankingSetupCompleted === 'true';

  const rankingSetupPending = node.attrs.initialDataSource === 'RANKING' && !isRankingSetupDone;
  const isRankingBlock = node.attrs.initialDataSource === 'RANKING' && isRankingSetupDone;

  const onCompleteQuerySetup = () => {
    setQuerySetupCompletedOptimistic(true);
    updateAttributes({ querySetupCompleted: true });
  };

  const onCompleteRankingSetup = ({ startDate, endDate }: { startDate: string; endDate: string }) => {
    setRankingSetupCompletedOptimistic(true);
    updateAttributes({
      rankingSetupCompleted: true,
      rankingStartDate: startDate || null,
      rankingEndDate: endDate || null,
    });
  };

  const rankingStartDate = typeof node.attrs.rankingStartDate === 'string' ? node.attrs.rankingStartDate : '';
  const rankingEndDate = typeof node.attrs.rankingEndDate === 'string' ? node.attrs.rankingEndDate : '';

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
              rankingSetupPending={rankingSetupPending}
              onCompleteRankingSetup={onCompleteRankingSetup}
              isRankingBlock={isRankingBlock}
              rankingStartDate={rankingStartDate}
              rankingEndDate={rankingEndDate}
              initialFiltersOpen={node.attrs.filtersOpenOnCreate === true || node.attrs.filtersOpenOnCreate === 'true'}
              onConsumedInitialFiltersOpen={() => updateAttributes({ filtersOpenOnCreate: false })}
            />
          </DataBlockProvider>
        </ErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}

import type { NodeViewProps } from '@tiptap/core';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { RankingBlock } from '../blocks/table/ranking-block';
import { TableBlockError } from '../blocks/table/table-block';

export const RankingNode = Node.create({
  name: 'rankingNode',
  group: 'block',
  atom: true,
  allowGapCursor: false,
  defining: true,

  addAttributes() {
    return {
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
        tag: 'ranking-node',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ranking-node', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RankingNodeComponent);
  },
});

function RankingNodeComponent({ node, updateAttributes }: NodeViewProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  const { blockRelations } = useEditorStoreLite();
  const relation = blockRelations.find(b => b.block.id === id);
  const relationEntityId = relation?.entityId ?? '';

  const [rankingSetupCompletedOptimistic, setRankingSetupCompletedOptimistic] = React.useState(false);

  React.useEffect(() => {
    setRankingSetupCompletedOptimistic(false);
  }, [id]);

  React.useEffect(() => {
    const persisted = node.attrs.rankingSetupCompleted === true || node.attrs.rankingSetupCompleted === 'true';
    if (persisted) {
      setRankingSetupCompletedOptimistic(false);
    }
  }, [node.attrs.rankingSetupCompleted]);

  const isRankingSetupDone =
    rankingSetupCompletedOptimistic ||
    node.attrs.rankingSetupCompleted === true ||
    node.attrs.rankingSetupCompleted === 'true';

  const rankingSetupPending = !isRankingSetupDone;

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
      <div contentEditable="false" suppressContentEditableWarning={true} className="ranking-node">
        <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={id} />} onError={reportBoundaryError}>
          <DataBlockProvider spaceId={spaceId} entityId={id} relationId={relationEntityId}>
            <RankingBlock
              spaceId={spaceId}
              blockId={id}
              rankingSetupPending={rankingSetupPending}
              onCompleteRankingSetup={onCompleteRankingSetup}
              rankingStartDate={rankingStartDate}
              rankingEndDate={rankingEndDate}
            />
          </DataBlockProvider>
        </ErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}

import { move } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';

import React from 'react';

import { useMutate } from '~/core/sync/use-mutate';
import { Relation } from '~/core/types';
import { sortRelations } from '~/core/utils/utils';

import { LinkableRelationChip } from './chip';

type Props = {
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  spaceId: string;
  afterChips?: React.ReactNode;
};

type DragDropProviderProps = React.ComponentProps<typeof DragDropProvider>;
type DragEndEvent = Parameters<NonNullable<DragDropProviderProps['onDragEnd']>>[0];

/**
 * Reorderable, flex-wrapped list of relation chips.
 *
 * Built on the next-gen dnd-kit (@dnd-kit/react): unlike the classic sortable
 * strategies — which compute transforms assuming uniform item sizes and therefore
 * stretch or mis-space variable-width chips — it measures the real DOM and
 * FLIP-animates reordering, so wrapped multi-row chip lists reflow correctly.
 * Reordering is optimistic during the drag; we commit positions on drop.
 */
export default function ReorderableRelationChipsDnd({ relations, onUpdateRelation, spaceId, afterChips }: Props) {
  const sortedRelations = sortRelations(relations);

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;

    const newList = move(sortedRelations, event);
    const changed = newList.some((relation, index) => relation.id !== sortedRelations[index]?.id);
    if (!changed) return;

    // Reassign the existing set of positions across the new slot order.
    newList.forEach((relation, index) => {
      onUpdateRelation(relation, sortedRelations[index]?.position ?? null);
    });
  };

  if (sortedRelations.length <= 1) {
    return (
      <>
        {sortedRelations.map(relation => (
          <div key={`relation-${relation.id}`} className="max-w-full min-w-0">
            <RelationChip relation={relation} spaceId={spaceId} />
          </div>
        ))}
        {afterChips}
      </>
    );
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      {sortedRelations.map((relation, index) => (
        <SortableRelationChip key={relation.id} relation={relation} index={index} spaceId={spaceId} />
      ))}
      {afterChips}
    </DragDropProvider>
  );
}

function RelationChip({
  relation,
  spaceId,
  dragHandleRef,
}: {
  relation: Relation;
  spaceId: string;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
}) {
  const { storage } = useMutate();

  return (
    <LinkableRelationChip
      isEditing
      small
      truncateLabel
      sortableDragHandleRef={dragHandleRef}
      onDelete={() => storage.relations.delete(relation)}
      onDone={result => {
        storage.relations.update(relation, draft => {
          draft.toSpaceId = result.space;
          draft.verified = result.verified;
        });
      }}
      currentSpaceId={spaceId}
      entityId={relation.toEntity.id}
      relationId={relation.id}
      relationEntityId={relation.entityId}
      spaceId={relation.toSpaceId}
      verified={relation.verified}
    >
      {relation.toEntity.name}
    </LinkableRelationChip>
  );
}

function SortableRelationChip({
  relation,
  index,
  spaceId,
}: {
  relation: Relation;
  index: number;
  spaceId: string;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: relation.id, index });

  const [justDragged, setJustDragged] = React.useState(false);

  // Keep a short window after a drag ends so the ensuing click doesn't navigate.
  React.useEffect(() => {
    if (isDragging) {
      setJustDragged(true);
    } else if (justDragged) {
      const timeout = setTimeout(() => setJustDragged(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isDragging, justDragged]);

  const handleClick = (event: React.MouseEvent) => {
    if (justDragged) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      ref={ref}
      className="relative inline-block max-w-full min-w-0"
      onClick={handleClick}
      onClickCapture={handleClick}
    >
      <RelationChip relation={relation} spaceId={spaceId} dragHandleRef={handleRef} />
    </div>
  );
}

'use client';

import * as React from 'react';

import { ROOT_SPACE } from '~/core/constants';
import { useSpace } from '~/core/hooks/use-space';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { Spaces } from '~/core/utils/space';

import { Dots } from '~/design-system/dots';

import { AddSubtopicSearchView, type AddSubtopicTarget } from '~/partials/space-page/add-subtopic-search-view';
import { SubtopicsDialogShell } from '~/partials/space-page/subtopics-dialog-shell';
import { SubtopicsTreeView } from '~/partials/space-page/subtopics-tree-view';

interface SubtopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

/**
 * The space whose Subtopics relations the tree reads, and where its edits are proposed.
 *
 * The root space's, whichever space the dialog is opened from (GEO-2351). The hierarchy is the root
 * space's to curate: it holds 185 of the graph's 73,822 Subtopics relations (measured 2026-09-30),
 * the rest scattered over other spaces, and a space's own copy is usually empty — the AI space shows no children
 * under `AI`, where the root space has nine.
 *
 * Edits follow the reads. A subtopic proposed in the current space would never appear in a tree read
 * from the root, and a removal would try to delete a relation the current space doesn't hold. So
 * the tree's access control, pending proposals and proposals are all the root space's too.
 */
const SUBTOPIC_TREE_SPACE_ID = ROOT_SPACE;

export function SubtopicsDialog({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  const { space, isLoading } = useSpace(spaceId);
  const rootEntityId = space ? Spaces.getSpaceSubtopicRootEntityId(space) : '';
  // Named from the space the dialog was opened in: that is the name the reader just saw in the
  // header, and the root space may hold no name for a space's own page entity.
  const rootName = useName(rootEntityId, spaceId);
  const [addTarget, setAddTarget] = React.useState<AddSubtopicTarget | null>(null);

  React.useEffect(() => {
    if (!open) {
      setAddTarget(null);
    }
  }, [open]);

  if (!open) return null;

  const isAddingSubtopic = addTarget !== null;
  const title = isAddingSubtopic ? `Add a subtopic to ${addTarget.parentName}` : 'Subtopics';

  return (
    <SubtopicsDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showBack={isAddingSubtopic}
      onBack={isAddingSubtopic ? () => setAddTarget(null) : undefined}
    >
      {isLoading || !space ? (
        <div className="flex h-24 items-center justify-center">
          <Dots />
        </div>
      ) : isAddingSubtopic ? (
        <AddSubtopicSearchView
          spaceId={SUBTOPIC_TREE_SPACE_ID}
          target={addTarget}
          onProposed={() => setAddTarget(null)}
        />
      ) : (
        <SubtopicsTreeView
          spaceId={SUBTOPIC_TREE_SPACE_ID}
          linkSpaceId={spaceId}
          rootEntityId={rootEntityId}
          rootName={rootName}
          onAddSubtopic={setAddTarget}
          onNavigate={() => onOpenChange(false)}
        />
      )}
    </SubtopicsDialogShell>
  );
}

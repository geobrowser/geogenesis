'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
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

export function SubtopicsDialog({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  const { space, isLoading } = useSpace(spaceId);
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
        <AddSubtopicSearchView spaceId={spaceId} target={addTarget} onProposed={() => setAddTarget(null)} />
      ) : (
        <SubtopicsTreeView
          spaceId={spaceId}
          rootEntityId={Spaces.getSpaceSubtopicRootEntityId(space)}
          onAddSubtopic={setAddTarget}
          onNavigate={() => onOpenChange(false)}
        />
      )}
    </SubtopicsDialogShell>
  );
}

'use client';

import { Editor } from '@tiptap/react';

import * as React from 'react';
import { forwardRef, useImperativeHandle, useEffect } from 'react';

import { SelectEntity } from '~/design-system/select-entity';

interface MentionListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  spaceId: string;
  editor: Editor;
  command: (entityId: string, entityName: string) => void;
  onEscape?: () => void;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(({ spaceId, command, onEscape }, ref) => {
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      // Let SelectEntity handle its own keyboard navigation
      if (event.key === 'Escape') {
        if (onEscape) {
          onEscape();
        }
        return true;
      }
      return false;
    },
  }));

    const handleEntitySelection = (result: { id: string; name: string | null }) => {
    // When creating a new entity, we want to ensure we use the name from the result
    // as it might be a newly created entity with a name that hasn't been propagated yet
    command(result.id, result.name || result.id);
  };

  const handleCreateEntity = (result: { id: string; name: string | null }) => {
    // For new entities, we pass the ID. The name is handled by the SelectEntity component's
    // internal storage updates (which we fixed in the previous step).
    // We return the ID so SelectEntity knows which ID to use.
    return result.id;
  };

  // Handle ESC key globally for this component
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape]);

  return (
    <SelectEntity
      spaceId={spaceId}
      withSearchIcon={true}
      placeholder="Link to Geo entity..."
      onDone={handleEntitySelection}
      onCreateEntity={handleCreateEntity}
      variant="floating"
      width="full"
      advanced={false}
      autoFocus={true}
      showUrlWarning={true}
    />
  );
});

MentionList.displayName = 'MentionList';

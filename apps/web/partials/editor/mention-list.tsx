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
    command(result.id, result.name || result.id);
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
      onCreateEntity={handleEntitySelection}
      variant="floating"
      width="full"
      advanced={false}
      autoFocus={true}
      showUrlWarning={true}
    />
  );
});

MentionList.displayName = 'MentionList';

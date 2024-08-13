'use client';

import * as React from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

export function EditableHeading({ spaceId, entityId }: { spaceId: string; entityId: string }) {
  const { name } = useEntityPageStore();
  const isEditing = useUserIsEditing(spaceId);

  const send = useEditEvents({
    context: {
      entityId,
      spaceId,
      entityName: name ?? '',
    },
  });

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_NAME',
      payload: {
        name: e.target.value,
      },
    });
  };

  return (
    <div className="relative">
      {isEditing ? (
        <div>
          <PageStringField variant="mainPage" placeholder="Entity name..." value={name ?? ''} onChange={onNameChange} />
          {/*
            This height differs from the readable page height due to how we're using an expandable textarea for editing
            the entity name. We can't perfectly match the height of the normal <Text /> field with the textarea, so we
            have to manually adjust the spacing here to remove the layout shift.
          */}
          <Spacer height={3.5} />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <Truncate maxLines={3} shouldTruncate>
              <Text as="h1" variant="mainPage">
                {name ?? entityId}
              </Text>
            </Truncate>
          </div>
          <Spacer height={12} />
        </div>
      )}
    </div>
  );
}

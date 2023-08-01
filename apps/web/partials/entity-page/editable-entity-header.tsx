'use client';

import Link from 'next/link';

import * as React from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store/editable-store';
import { Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { Editor } from '~/partials/editor/editor';

import { EntityPageMetadataHeader, SpacePageMetadataHeader } from './entity-page-metadata-header';

export function EditableHeading({
  spaceId,
  entityId,
  name: serverName,
  triples: serverTriples,
  space = false,
}: {
  spaceId: string;
  entityId: string;
  name: string;
  triples: Triple[];
  space?: boolean;
}) {
  const { triples: localTriples, update, create, remove } = useEntityPageStore();
  const { editable } = useEditable();
  const { isEditor, isAdmin, isEditorController } = useAccessControl(spaceId);
  const { actionsFromSpace } = useActionsStore(spaceId);

  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  const isEditing = editable && isEditor;
  const nameTriple = Entity.nameTriple(triples);
  // Default to the server name if there is no local name only when in browse mode.
  // Otherwise leave it empty when in edit mode.
  const name = isEditing ? Entity.name(triples) ?? '' : serverName;
  const types = Entity.types(triples) ?? [];

  const send = useEditEvents({
    context: {
      entityId,
      spaceId,
      entityName: name,
    },
    api: {
      create,
      update,
      remove,
    },
  });

  const onNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({
      type: 'EDIT_ENTITY_NAME',
      payload: {
        name: e.target.value,
        triple: nameTriple,
      },
    });
  };

  return (
    <div className="relative">
      {!space && isEditing ? (
        <div>
          <PageStringField variant="mainPage" placeholder="Entity name..." value={name} onChange={onNameChange} />
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
                {name}
              </Text>
            </Truncate>
            {isEditing && (
              <div className="flex shrink-0 items-center gap-2">
                {(isAdmin || isEditorController) && (
                  <Link href={NavUtils.toAdmin(spaceId)}>
                    <Button className="shrink" variant="secondary">
                      Access control
                    </Button>
                  </Link>
                )}
                <Link href={NavUtils.toEntity(spaceId, ID.createEntityId())}>
                  <Button icon="create">New entity</Button>
                </Link>
              </div>
            )}
          </div>
          <Spacer height={12} />
        </div>
      )}
      {!space ? (
        <EntityPageMetadataHeader id={entityId} spaceId={spaceId} types={types} />
      ) : (
        <SpacePageMetadataHeader spaceId={spaceId} />
      )}
    </div>
  );
}

import * as React from 'react';
import Link from 'next/link';

import { useActionsStore } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Entity, useEntityStore } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';
import { Triple } from '~/modules/types';
import { useEditEvents } from './edit-events';
import { PageStringField } from './editable-fields';
import { Spacer } from '~/modules/design-system/spacer';
import { Truncate } from '~/modules/design-system/truncate';
import { Text } from '~/modules/design-system/text';
import { EntityPageMetadataHeader, SpacePageMetadataHeader } from '../entity-page/entity-page-metadata-header';
import { Editor } from '../editor/editor';
import { Button } from '~/modules/design-system/button';
import { NavUtils } from '~/modules/utils';

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
  const { triples: localTriples, update, create, remove } = useEntityStore();
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const { actionsFromSpace } = useActionsStore(spaceId);

  const triples = localTriples.length === 0 && actionsFromSpace.length === 0 ? serverTriples : localTriples;

  const nameTriple = Entity.nameTriple(triples);
  const name = Entity.name(triples) ?? serverName;
  const types = Entity.types(triples) ?? [];

  const isEditing = editable && isEditor;

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
          <Spacer height={5.5} />
        </div>
      ) : (
        <div>
          <Truncate maxLines={3} shouldTruncate>
            <Text as="h1" variant="mainPage">
              {name}
            </Text>
          </Truncate>
          <Spacer height={12} />
        </div>
      )}
      {!space ? (
        <EntityPageMetadataHeader id={entityId} spaceId={spaceId} types={types} />
      ) : (
        <SpacePageMetadataHeader spaceId={spaceId} />
      )}
      <Spacer height={40} />
      <Editor editable={isEditing} />
      {space && isEditing && (
        <div className="absolute top-0 right-0">
          <Link href={NavUtils.toCreateEntity(spaceId)} passHref>
            <a>
              <Button icon="create">New entity</Button>
            </a>
          </Link>
        </div>
      )}
    </div>
  );
}

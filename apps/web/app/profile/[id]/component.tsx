'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Triple } from '~/core/types';

import { Editor } from '~/partials/editor/editor';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { ReferencedByEntity } from '~/partials/entity-page/types';

interface Props {
  id: string;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];
  triples: Triple[];
}

export function ProfilePageComponent(props: Props) {
  const renderEditablePage = useUserIsEditing(props.id);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <>
      <Editor editable={renderEditablePage} />
      <Page id={props.id} spaceId={props.id} triples={props.triples} />
    </>
  );
}

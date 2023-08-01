'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Triple } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { ReferencedByEntity } from '~/partials/entity-page/types';
import { PersonalSpaceOnboarding } from '~/partials/profile/personal-space-onboarding';

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
      <PersonalSpaceOnboarding />
      <Spacer height={40} />
      <Page id={props.id} spaceId={props.id} triples={props.triples} />
    </>
  );
}

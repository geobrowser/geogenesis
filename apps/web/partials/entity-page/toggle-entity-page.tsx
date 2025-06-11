'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Value } from '~/core/v2.types';

import { EditableEntityPage } from './editable-entity-page';
import { ReadableEntityPage } from './readable-entity-page';

type EntityPageProps = {
  values: Value[];
  id: string;
  spaceId: string;
};

export function ToggleEntityPage(props: EntityPageProps) {
  const renderEditablePage = useUserIsEditing(props.spaceId);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return <Page {...props} />;
}

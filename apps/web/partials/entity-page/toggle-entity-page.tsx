'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Relation } from '~/core/io/dto/entities';
import type { Triple } from '~/core/types';

import { EditableEntityPage } from './editable-entity-page';
import { ReadableEntityPage } from './readable-entity-page';

type EntityPageProps = {
  triples: Triple[];
  relationsOut: Relation[];
  id: string;
  spaceId: string;
};

export function ToggleEntityPage(props: EntityPageProps) {
  const renderEditablePage = useUserIsEditing(props.spaceId);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return <Page {...props} relations={props.relationsOut} />;
}

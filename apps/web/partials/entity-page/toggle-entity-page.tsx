'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import type { Relation, Triple } from '~/core/types';

import { EditableEntityPage } from './editable-entity-page';
import { ReadableEntityPage } from './readable-entity-page';

type EntityPageProps = {
  triples: Triple[];
  relationsOut: Relation[];
  id: string;
  spaceId: string;
  typeId?: string | null;
  attributes?: Array<Attribute> | null;
};

type Attribute = [AttributeId, AttributeValue];
type AttributeId = string;
type AttributeValue = string;

export function ToggleEntityPage(props: EntityPageProps) {
  const renderEditablePage = useUserIsEditing(props.spaceId);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return <Page {...props} relations={props.relationsOut} />;
}

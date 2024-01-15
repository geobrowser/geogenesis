'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Triple } from '~/core/types';

import { EditableEntityPage } from './editable-entity-page';
import { ReadableEntityPage } from './readable-entity-page';

interface Props {
  triples: Triple[];
  id: string;
  spaceId: string;
  typeId?: string | null;
  filters?: Array<Filter> | null;
}

type Filter = [FilterId, FilterValue];
type FilterId = string;
type FilterValue = string;

export function ToggleEntityPage(props: Props) {
  const renderEditablePage = useUserIsEditing(props.spaceId);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return <Page {...props} />;
}

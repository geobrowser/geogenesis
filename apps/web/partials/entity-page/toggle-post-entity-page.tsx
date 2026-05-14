'use client';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';

import { EditablePostEntityPage } from '~/partials/entity-page/editable-post-entity-page';
import { ReadablePostEntityPage } from '~/partials/entity-page/readable-post-entity-page';

type Props = {
  id: string;
  spaceId: string;
};

export function TogglePostEntityPage(props: Props) {
  const editing = useUserIsEditing(props.spaceId);
  const Page = editing ? EditablePostEntityPage : ReadablePostEntityPage;
  return <Page {...props} />;
}

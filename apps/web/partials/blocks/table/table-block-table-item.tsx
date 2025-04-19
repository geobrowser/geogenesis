import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { EditableTitle } from '~/partials/blocks/table/editable-title';

type TableBlockTableItemProps = {
  isEditing: boolean;
  name: string | null;
  href: string;
  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  collectionId?: string;
  relationId?: string;
  verified?: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
};

export const TableBlockTableItem = ({
  isEditing,
  name,
  href,
  currentSpaceId,
  entityId,
  spaceId,
  collectionId,
  relationId,
  verified,
  onChangeEntry,
  onLinkEntry,
}: TableBlockTableItemProps) => {
  return (
    <EditableTitle
      view="TABLE"
      isEditing={isEditing}
      name={name}
      href={href}
      currentSpaceId={currentSpaceId}
      entityId={entityId}
      spaceId={spaceId}
      collectionId={collectionId}
      relationId={relationId}
      verified={verified}
      onChangeEntry={onChangeEntry}
      onLinkEntry={onLinkEntry}
    />
  );
};

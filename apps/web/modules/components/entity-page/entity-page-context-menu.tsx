import * as React from 'react';
import { Icon } from '~/modules/design-system/icon';
import { Menu } from '~/modules/design-system/menu';
import { useEntityStore } from '~/modules/entity';
import { batch } from '@legendapp/state';
import { useUserIsEditing } from '~/modules/hooks/use-user-is-editing';

interface Props {
  entityId: string;
  spaceId: string;
}

export function EntityPageContextMenu({ entityId, spaceId }: Props) {
  const [isMenuOpen, onMenuOpenChange] = React.useState(false);
  const isEditing = useUserIsEditing(spaceId);
  const { triples, schemaTriples, remove } = useEntityStore();

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      onMenuOpenChange(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const onDelete = () => {
    batch(() => {
      triples.forEach(t => remove(t));
      schemaTriples.forEach(t => remove(t));
    });

    onMenuOpenChange(false);
  };

  return (
    <Menu
      className="w-[160px]"
      open={isMenuOpen}
      onOpenChange={onMenuOpenChange}
      trigger={<Icon icon="context" color="grey-04" />}
      side="bottom"
    >
      <EntityPageContextMenuItem>
        <button className="flex h-full w-full items-center gap-2 px-2 py-2" onClick={onCopyId}>
          <Icon icon="copy" />
          Copy ID
        </button>
      </EntityPageContextMenuItem>
      {isEditing && (
        <EntityPageContextMenuItem>
          <button className="flex h-full w-full items-center gap-2 px-2 py-2 text-red-01" onClick={onDelete}>
            <Icon icon="trash" />
            Delete entity
          </button>
        </EntityPageContextMenuItem>
      )}
    </Menu>
  );
}

interface EntityPageContextMenuItemProps {
  children: React.ReactNode;
}

function EntityPageContextMenuItem({ children }: EntityPageContextMenuItemProps) {
  return (
    <div className={`w-full divide-y divide-divider bg-white text-button text-grey-04 hover:bg-bg hover:text-text`}>
      {children}
    </div>
  );
}

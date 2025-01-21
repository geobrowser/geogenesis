'use client';

import * as React from 'react';

import { removeRelation, useWriteOps } from '~/core/database/write';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Trash } from '~/design-system/icons/trash';
import { Menu } from '~/design-system/menu';

interface Props {
  entityId: string;
  spaceId: string;
}

export function EntityPageContextMenu({ entityId, spaceId }: Props) {
  const [isMenuOpen, onMenuOpenChange] = React.useState(false);

  const isEditing = useUserIsEditing(spaceId);
  const { triples, relations } = useEntityPageStore();
  const { remove } = useWriteOps();

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      onMenuOpenChange(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const onDelete = () => {
    triples.forEach(t => remove(t, t.space));
    relations.forEach(r => removeRelation({ fromEntityId: r.fromEntity.id, relationId: r.id, spaceId }));
    onMenuOpenChange(false);
  };

  return (
    <Menu
      className="max-w-[160px]"
      open={isMenuOpen}
      onOpenChange={onMenuOpenChange}
      trigger={<Context color="grey-04" />}
      side="bottom"
    >
      <EntityPageContextMenuItem>
        <button className="flex h-full w-full items-center gap-2 px-2 py-2" onClick={onCopyId}>
          <Copy color="grey-04" />
          Copy ID
        </button>
      </EntityPageContextMenuItem>
      {isEditing && (
        <>
          <EntityPageContextMenuItem>
            <button className="flex h-full w-full items-center gap-2 px-2 py-2 text-red-01" onClick={onDelete}>
              <Trash />
              Delete entity
            </button>
          </EntityPageContextMenuItem>
        </>
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

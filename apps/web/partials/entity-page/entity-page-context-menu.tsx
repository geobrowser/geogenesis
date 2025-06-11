'use client';

import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { EntityId } from '~/core/io/schema';
import { useEditable } from '~/core/state/editable-store';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';

import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { MoveSpace } from '~/design-system/icons/move-space';
import { Trash } from '~/design-system/icons/trash';
import { Menu } from '~/design-system/menu';

import { CreateNewVersionInSpace } from '~/partials/versions/create-new-version-in-space';

type Props = {
  entityId: string;
  entityName: string;
  spaceId: string;
};

export function EntityPageContextMenu({ entityId, entityName, spaceId }: Props) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const { isMember } = useAccessControl(spaceId);

  const { editable, setEditable } = useEditable();
  const { values, relations } = useEntityPageStore();
  const { transaction } = useMutate();

  const onCopyEntityId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const onDelete = () => {
    if (editable) {
      transaction.commit(db => {
        values.forEach(t => db.values.delete(t));
        relations.forEach(r => db.relations.delete(r));
      });
      setIsMenuOpen(false);
    } else {
      setEditable(true);

      // Why?
      setTimeout(() => {
        transaction.commit(db => {
          values.forEach(t => db.values.delete(t));
          relations.forEach(r => db.relations.delete(r));
        });
        setIsMenuOpen(false);
      }, 500);
    }
  };

  const [isCreatingNewVersion, setIsCreatingNewVersion] = useState<boolean>(false);

  return (
    <Menu
      className={cx(!isCreatingNewVersion ? 'max-w-[160px]' : 'max-w-[320px]')}
      open={isMenuOpen}
      onOpenChange={() => {
        setIsMenuOpen(!isMenuOpen);
        setIsCreatingNewVersion(false);
      }}
      trigger={<Context color="grey-04" />}
      side="bottom"
    >
      {isCreatingNewVersion && (
        <CreateNewVersionInSpace
          entityId={entityId as EntityId}
          entityName={entityName}
          setIsCreatingNewVersion={setIsCreatingNewVersion}
          onDone={() => {
            setIsMenuOpen(false);
          }}
        />
      )}
      {!isCreatingNewVersion && (
        <>
          <EntityPageContextMenuItem>
            <button className="flex h-full w-full items-center gap-2 px-2 py-2" onClick={onCopyEntityId}>
              <Copy color="grey-04" />
              Copy ID
            </button>
          </EntityPageContextMenuItem>
          <EntityPageContextMenuItem>
            <button
              onClick={() => setIsCreatingNewVersion(true)}
              className="flex h-full w-full items-center gap-2 px-2 py-2"
            >
              <div className="shrink-0">
                <MoveSpace />
              </div>
              Create in space
            </button>
          </EntityPageContextMenuItem>
          {isMember && (
            <EntityPageContextMenuItem>
              <button className="flex h-full w-full items-center gap-2 px-2 py-2 text-red-01" onClick={onDelete}>
                <Trash />
                Delete entity
              </button>
            </EntityPageContextMenuItem>
          )}
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

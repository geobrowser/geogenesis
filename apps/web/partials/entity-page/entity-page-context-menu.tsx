'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { EntityId } from '~/core/io/substream-schema';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues, useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

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
  const { storage } = useMutate();
  const { store } = useSyncEngine();
  const { isMember } = useAccessControl(spaceId);

  const { editable, setEditable } = useEditable();

  const values = useValues({
    selector: v => v.entity.id === entityId && v.spaceId === spaceId,
  });

  const outgoingRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId,
  });

  const performDelete = React.useCallback(() => {
    // 1. Find block entities (toEntity of BLOCKS relations). Orphaned = only this entity references them.
    const blocksRelations = outgoingRelations.filter(r => r.type.id === SystemIds.BLOCKS);
    const blockIds = [...new Set(blocksRelations.map(r => r.toEntity.id))];
    const orphanedBlockIds = blockIds.filter(blockId => {
      const referencing = store.findReferencingEntities(blockId);
      return referencing.length === 1 && referencing[0] === entityId;
    });

    // 2. Collect all values and relations to delete so we can batch (one store update each = no flash).
    const allValuesToDelete = [...values];
    const relationIds = new Set<string>();
    const allRelationsToDelete: typeof outgoingRelations = [];
    for (const r of [...outgoingRelations, ...getRelations({ selector: r => r.toEntity.id === entityId })]) {
      if (!relationIds.has(r.id)) {
        relationIds.add(r.id);
        allRelationsToDelete.push(r);
      }
    }

    for (const blockId of orphanedBlockIds) {
      allValuesToDelete.push(...getValues({ selector: v => v.entity.id === blockId }));
      for (const r of getRelations({
        selector: r => r.fromEntity.id === blockId || r.toEntity.id === blockId,
      })) {
        if (!relationIds.has(r.id)) {
          relationIds.add(r.id);
          allRelationsToDelete.push(r);
        }
      }
    }

    storage.values.deleteMany(allValuesToDelete);
    storage.relations.deleteMany(allRelationsToDelete);
  }, [
    entityId,
    outgoingRelations,
    store,
    storage.relations,
    storage.values,
    values,
  ]);

  const onCopyEntityId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const onDelete = () => {
    setIsMenuOpen(false);
    if (editable) {
      requestAnimationFrame(() => performDelete());
    } else {
      setEditable(true);
      setTimeout(() => performDelete(), 500);
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
          sourceSpaceId={spaceId}
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

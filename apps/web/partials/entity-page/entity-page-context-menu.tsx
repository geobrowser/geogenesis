'use client';

import cx from 'classnames';
import Fuse from 'fuse.js';
import { useRouter } from 'next/navigation';

import * as React from 'react';
import { useState } from 'react';

import { removeRelation, useWriteOps } from '~/core/database/write';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EntityId } from '~/core/io/schema';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { getImagePath } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { MoveSpace } from '~/design-system/icons/move-space';
import { Trash } from '~/design-system/icons/trash';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';

interface Props {
  entityId: string;
  spaceId: string;
}

export function EntityPageContextMenu({ entityId, spaceId }: Props) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const isEditing = useUserIsEditing(spaceId);
  const { triples, relations } = useEntityPageStore();
  const { remove } = useWriteOps();

  const onCopyEntityId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const onCopySpaceId = async () => {
    try {
      await navigator.clipboard.writeText(spaceId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy space ID in: ', spaceId);
    }
  };

  const onDelete = () => {
    triples.forEach(t => remove(t, t.space));
    relations.forEach(r => removeRelation({ fromEntityId: r.fromEntity.id, relationId: r.id, spaceId }));
    setIsMenuOpen(false);
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
              Copy Entity ID
            </button>
          </EntityPageContextMenuItem>
          <EntityPageContextMenuItem>
            <button className="flex h-full w-full items-center gap-2 px-2 py-2" onClick={onCopySpaceId}>
              <Copy color="grey-04" />
              Copy Space ID
            </button>
          </EntityPageContextMenuItem>
          {isEditing && (
            <>
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
              <EntityPageContextMenuItem>
                <button className="flex h-full w-full items-center gap-2 px-2 py-2 text-red-01" onClick={onDelete}>
                  <Trash />
                  Delete entity
                </button>
              </EntityPageContextMenuItem>
            </>
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

type CreateNewVersionInSpaceProps = {
  entityId: EntityId;
  setIsCreatingNewVersion: React.Dispatch<React.SetStateAction<boolean>>;
  onDone?: () => void;
};

const CreateNewVersionInSpace = ({ entityId, setIsCreatingNewVersion, onDone }: CreateNewVersionInSpaceProps) => {
  const router = useRouter();

  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const spaces = useSpacesWhereMember(address);

  const [query, setQuery] = useState<string>('');

  const fuseOptions = {
    keys: ['spaceConfig.name', 'spaceConfig.description'],
  };

  const fuse = new Fuse(spaces, fuseOptions);

  const renderedSpaces = query.length === 0 ? spaces : fuse.search(query).map(result => result.item);

  return (
    <div className="bg-white">
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsCreatingNewVersion(false)}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-[4] p-2 text-center text-button text-text">Select space to create in</div>
        <div className="flex-1"></div>
      </div>
      <div className="p-1">
        <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon />
      </div>
      <div className="flex max-h-[190px] flex-col gap-1 overflow-auto p-1">
        {renderedSpaces.map(space => {
          return (
            <button
              key={space.id}
              onClick={() => {
                router.push(NavUtils.toEntity(space.id, entityId));
                onDone?.();
              }}
              className="flex cursor-pointer items-center gap-2 rounded p-1 transition-colors duration-150 ease-in-out hover:bg-grey-01"
            >
              <div className="relative size-4 rounded bg-grey-01">
                <img
                  src={getImagePath(space.spaceConfig.image)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="text-button text-text">{space.spaceConfig.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

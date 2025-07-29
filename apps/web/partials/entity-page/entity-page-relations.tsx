'use client';

import * as Popover from '@radix-ui/react-popover';
import cx from 'classnames';
import Image from 'next/image';
import Link from 'next/link';
import pluralize from 'pluralize';

import React, { useEffect, useState } from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EntityId } from '~/core/io/schema';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import type { Relation } from '~/core/v2.types';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { ChevronUpBig } from '~/design-system/icons/chevron-up-big';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu as MenuIcon } from '~/design-system/icons/menu';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { Menu, MenuItem } from '~/design-system/menu';
import { ResizableContainer } from '~/design-system/resizable-container';
import { SelectSpaceAsPopover } from '~/design-system/select-space-dialog';

type EntityPageRelationsProps = {
  spaceId: string;
  entityId: string;
  relations: Relation[];
};

export const EntityPageRelations = ({ spaceId, entityId, relations: serverRelations }: EntityPageRelationsProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const { hydrate } = useSyncEngine();

  const clientRelations = useRelations({
    selector: r => r.entityId === entityId,
  });

  const relations = isHydrated ? clientRelations : serverRelations;

  useEffect(() => {
    if (serverRelations && serverRelations.length > 0) {
      const entityIds = serverRelations.map(r => r.fromEntity.id);
      hydrate(entityIds);
      setTimeout(() => {
        setIsHydrated(true);
      }, 1_000);
    }
  }, [serverRelations, hydrate]);

  return (
    <div className={cx(isOpen && 'pb-3')}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between py-3">
        <div>
          {relations.length} {pluralize('relation', relations.length)}
        </div>
        <div className={cx(isOpen && 'scale-y-[-1]', 'transition-transform duration-300 ease-in-out')}>
          <ChevronUpBig color="text" />
        </div>
      </button>
      <ResizableContainer>
        {isOpen && (
          <div className="divide-y divide-grey-02 border-b border-t border-grey-02">
            {relations.map(relation => (
              <Relationship key={relation.id} relation={relation} spaceId={spaceId} />
            ))}
          </div>
        )}
      </ResizableContainer>
    </div>
  );
};

type RelationshipProps = {
  relation: Relation;
  spaceId: string;
};

const Relationship = ({ relation, spaceId }: RelationshipProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [hasCopiedId, setHasCopiedId] = useState<boolean>(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  const isEditing = useUserIsEditing(spaceId);
  const { space } = useSpace(relation.toSpaceId ?? '');

  const { storage } = useMutate();

  const onCopyRelationId = async () => {
    try {
      await navigator.clipboard.writeText(relation.id);
      setHasCopiedId(true);
      setTimeout(() => {
        setHasCopiedId(false);
        setIsMenuOpen(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy relation ID: ', relation.id);
    }
  };

  return (
    <div
      key={relation.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsMenuOpen(false);
        setIsPopoverOpen(false);
      }}
      className="relative flex text-smallTitle font-medium leading-none"
    >
      <div className="flex-1 p-3">
        <Link href={NavUtils.toEntity(spaceId, relation.fromEntity.id)}>{relation.fromEntity.name}</Link>
      </div>
      <Link
        href={NavUtils.toEntity(relation.spaceId ?? spaceId, relation.type.id)}
        className="inline-flex flex-1 items-center justify-between bg-grey-01 p-3"
      >
        <span>{relation.type.name}</span>
        <RightArrowLong color="text" />
      </Link>
      <div className="flex-1 p-3">
        <div className="inline-flex items-center gap-2">
          <Link
            href={NavUtils.toEntity(relation.toSpaceId ?? relation.spaceId ?? spaceId, relation.toEntity.id)}
            className="inline-flex items-center gap-2"
          >
            {relation.toEntity.name}
            {relation.verified && (
              <span className="inline-block">
                <CheckCircle color="text" />
              </span>
            )}
          </Link>
          {isHovered && isEditing && (
            <div className="inline-block">
              <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <Popover.Trigger asChild>
                  <button
                    onMouseEnter={() => setIsPopoverOpen(true)}
                    className="text-grey-03 transition duration-300 ease-in-out hover:text-text"
                  >
                    <MenuIcon />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="top"
                    sideOffset={-4}
                    className="group z-100 flex items-center rounded-[7px] border border-grey-04 bg-white hover:bg-divider"
                  >
                    <SelectSpaceAsPopover
                      entityId={EntityId(relation.toEntity.id)}
                      spaceId={relation.toSpaceId}
                      verified={relation.verified}
                      onDone={result => {
                        storage.relations.update(relation, draft => {
                          draft.toSpaceId = result.space;
                          draft.verified = result.verified;
                        });
                      }}
                      trigger={
                        <button className="inline-flex items-center p-1">
                          <span className="inline-flex size-[12px] items-center justify-center rounded-sm border hover:!border-text hover:!text-text group-hover:border-grey-03 group-hover:text-grey-03">
                            {space ? (
                              <div className="size-[8px] overflow-clip rounded-sm grayscale">
                                <Image fill src={getImagePath(space.entity.image)} alt="" />
                              </div>
                            ) : (
                              <TopRanked />
                            )}
                          </span>
                        </button>
                      }
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          )}
        </div>
      </div>
      {isHovered && (
        <div className="absolute bottom-0 right-0 top-0 inline-flex items-center">
          <Menu
            className="max-w-[160px]"
            open={isMenuOpen}
            onOpenChange={() => setIsMenuOpen(!isMenuOpen)}
            trigger={isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
            side="bottom"
          >
            <MenuItem onClick={onCopyRelationId}>
              <span className={cx('absolute', !hasCopiedId && 'invisible')}>Copied!</span>
              <span className={cx(hasCopiedId && 'invisible')}>Copy relation ID</span>
            </MenuItem>
            <MenuItem>
              <div className="flex flex-col">
                <span>Index</span>
                <span className="text-grey-04">{relation.position || 'unset'}</span>
              </div>
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
};

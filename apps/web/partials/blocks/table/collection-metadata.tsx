import * as Popover from '@radix-ui/react-popover';
import Image from 'next/image';

import type { ReactNode } from 'react';
import { useState } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import type { DataBlockView } from '~/core/blocks/data/use-view';
import { removeRelation, useWriteOps } from '~/core/database/write';
import { useSpace } from '~/core/hooks/use-space';
import { EntityId } from '~/core/io/schema';
import { useQueryEntity } from '~/core/sync/use-store';
import { getImagePath } from '~/core/utils/utils';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Menu } from '~/design-system/icons/menu';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { SelectSpaceAsPopover } from '~/design-system/select-space-dialog';

import type { onLinkEntryFn } from '~/partials/blocks/table/change-entry';

type CollectionMetadataProps = {
  view: DataBlockView;
  isEditing: boolean;
  name: string | null;
  href: string;
  currentSpaceId: string;
  entityId: string;
  spaceId?: string;
  collectionId?: string;
  relationId?: string;
  verified?: boolean;
  onLinkEntry: onLinkEntryFn;
  children: ReactNode;
};

export const CollectionMetadata = ({
  view,
  isEditing,
  currentSpaceId,
  entityId,
  spaceId,
  collectionId,
  relationId,
  verified,
  onLinkEntry,
  children,
}: CollectionMetadataProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  const { blockEntity } = useDataBlock();
  const { space } = useSpace(spaceId ?? '');
  const { remove } = useWriteOps();

  const { entity: collectionEntity } = useQueryEntity({
    id: collectionId,
    spaceId,
  });

  const { entity: relationEntity } = useQueryEntity({
    id: relationId,
    spaceId,
  });

  const onDeleteEntry = async () => {
    if (blockEntity) {
      const blockRelation = blockEntity.relationsOut.find(r => r.toEntity.id === entityId);

      if (blockRelation) {
        removeRelation({ relation: blockRelation, spaceId: currentSpaceId });
      }
    }

    if (collectionEntity) {
      collectionEntity.triples.forEach(t => remove(t, t.space));
      collectionEntity.relationsOut.forEach(r => removeRelation({ relation: r, spaceId: currentSpaceId }));
    }

    if (relationEntity) {
      relationEntity.triples.forEach(t => remove(t, t.space));
      relationEntity.relationsOut.forEach(r => removeRelation({ relation: r, spaceId: currentSpaceId }));
    }
  };

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPopoverOpen(false);
      }}
    >
      <div className="absolute -inset-2 z-0" />
      <div className="relative z-10 flex w-full items-center gap-2">
        {children}
        {verified && (
          <span>
            <CheckCircle color={isEditing || view !== 'TABLE' ? 'text' : 'ctaHover'} />
          </span>
        )}
        {relationId && isHovered && (
          <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <Popover.Trigger asChild>
              <button
                onMouseEnter={() => setIsPopoverOpen(true)}
                className="text-grey-03 transition duration-300 ease-in-out hover:text-text"
              >
                <Menu />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                sideOffset={-4}
                className="group z-100 flex items-center rounded-[7px] border border-grey-04 bg-white hover:bg-divider"
              >
                {isEditing && (
                  <SelectSpaceAsPopover
                    entityId={EntityId(entityId)}
                    spaceId={spaceId}
                    verified={verified}
                    onDone={result => {
                      if (!relationId) return;

                      onLinkEntry(relationId, result, verified);
                    }}
                    trigger={
                      <button className="inline-flex items-center p-1">
                        <span className="inline-flex size-[12px] items-center justify-center rounded-sm border hover:!border-text hover:!text-text group-hover:border-grey-03 group-hover:text-grey-03">
                          {space ? (
                            <div className="size-[8px] overflow-clip rounded-sm grayscale">
                              <Image fill src={getImagePath(space.spaceConfig.image)} alt="" />
                            </div>
                          ) : (
                            <TopRanked />
                          )}
                        </span>
                      </button>
                    }
                  />
                )}
                <PrefetchLink
                  href={`/space/${currentSpaceId}/${relationId}`}
                  className="p-1 hover:!text-text group-hover:text-grey-03"
                >
                  <RelationSmall />
                </PrefetchLink>
                {isEditing && (
                  <button onClick={onDeleteEntry} className="p-1 hover:!text-text group-hover:text-grey-03">
                    <CheckCloseSmall />
                  </button>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </div>
  );
};

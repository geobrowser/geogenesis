import { SystemIds } from '@graphprotocol/grc-20';
import * as Popover from '@radix-ui/react-popover';
import cx from 'classnames';
import Image from 'next/image';

import { useEffect, useRef, useState } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import type { DataBlockView } from '~/core/blocks/data/use-view';
import { removeRelation, useWriteOps } from '~/core/database/write';
import { useOnClickOutside } from '~/core/hooks/use-on-click-outside';
import { useSpace } from '~/core/hooks/use-space';
import { EntityId } from '~/core/io/schema';
import { useQueryEntity } from '~/core/sync/use-store';
import { getImagePath } from '~/core/utils/utils';

import { FocusedStringField, debounce } from '~/design-system/editable-fields/editable-fields';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { Menu } from '~/design-system/icons/menu';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { TopRanked } from '~/design-system/icons/top-ranked';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { SelectSpaceAsPopover } from '~/design-system/select-space-dialog';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';

type EditableTitleProps = {
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
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
};

export const EditableTitle = ({
  view,
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
}: EditableTitleProps) => {
  const [newName, setNewName] = useState<string>(() => name ?? '');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
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

  // If the name is changed externally we need to update the local state here.
  // Since the knowledge graph is highly relational it can often happen where
  // the same entity is rendered in multiple places on the same page, so changing
  // that entity anywhere should update it everywhere.
  useEffect(() => {
    setNewName(name ?? '');
  }, [name]);

  // Debounce any changes so we can apply it onChange instead of onBlur
  const debouncedCallback = debounce((value: string) => {
    onChangeEntry(
      {
        entityId,
        entityName: value,
        spaceId: currentSpaceId,
      },
      {
        type: 'EVENT',
        data: {
          type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
          payload: {
            renderable: {
              attributeId: SystemIds.NAME_ATTRIBUTE,
              entityId,
              spaceId: currentSpaceId,
              attributeName: 'Name',
              entityName: name,
              type: 'TEXT',
              value: name ?? '',
            },
            value: { type: 'TEXT', value },
          },
        },
      }
    );
  }, 1000);

  const handleChange = (value: string) => {
    setNewName(value);
    debouncedCallback(value);
  };

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
        {!isEditingTitle ? (
          <>
            {!isEditing ? (
              <Link
                href={href}
                className={cx(
                  'truncate',
                  view === 'TABLE' && 'text-tableCell text-ctaHover',
                  view === 'LIST' && 'text-smallTitle font-medium text-text',
                  view === 'GALLERY' && 'text-smallTitle font-medium text-text'
                )}
              >
                {newName}
              </Link>
            ) : (
              <button
                onClick={() => setIsEditingTitle(true)}
                className={cx(
                  'cursor-text truncate',
                  view === 'TABLE' && 'text-tableCell text-text',
                  view === 'LIST' && 'text-body text-text',
                  view === 'GALLERY' && 'text-body text-text'
                )}
              >
                {newName}
              </button>
            )}
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
          </>
        ) : (
          <EditingTitle
            view={view}
            name={name ?? ''}
            newName={newName}
            setNewName={handleChange}
            entityId={entityId}
            currentSpaceId={currentSpaceId}
            onChangeEntry={onChangeEntry}
            onDone={() => setIsEditingTitle(false)}
          />
        )}
      </div>
    </div>
  );
};

type EditingTitleProps = {
  view: DataBlockView;
  name: string;
  newName: string;
  setNewName: (value: string) => void;
  currentSpaceId: string;
  entityId: string;
  onChangeEntry: onChangeEntryFn;
  onDone: () => void;
};

const EditingTitle = ({
  view,
  name,
  newName,
  setNewName,
  currentSpaceId,
  entityId,
  onChangeEntry,
  onDone,
}: EditingTitleProps) => {
  const ref = useRef(null);

  useOnClickOutside(() => {
    onChangeEntry(
      {
        entityId,
        entityName: name,
        spaceId: currentSpaceId,
      },
      {
        type: 'EVENT',
        data: {
          type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
          payload: {
            renderable: {
              attributeId: SystemIds.NAME_ATTRIBUTE,
              entityId,
              spaceId: currentSpaceId,
              attributeName: 'Name',
              entityName: name,
              type: 'TEXT',
              value: name ?? '',
            },
            value: { type: 'TEXT', value: newName },
          },
        },
      }
    );
    onDone();
  }, ref);

  return (
    <div
      ref={ref}
      className={cx(
        'w-full',
        view === 'TABLE' && '*:!text-tableCell *:!tracking-normal',
        view === 'LIST' && '',
        view === 'GALLERY' && ''
      )}
    >
      <FocusedStringField
        placeholder="Entity name..."
        value={newName}
        onChange={string => {
          setNewName(string);
        }}
      />
    </div>
  );
};

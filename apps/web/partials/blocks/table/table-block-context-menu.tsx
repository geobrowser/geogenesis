'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom } from 'jotai';
import Image from 'next/legacy/image';
import Link from 'next/link';
import pluralize from 'pluralize';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useMergedData } from '~/core/hooks/use-merged-data';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useMigrateHub } from '~/core/migrate/migrate';
import { useTableBlock } from '~/core/state/table-block-store';
import { Entity as IEntity, Triple as ITriple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import { ValueTypeId, valueTypeNames, valueTypes } from '~/core/value-types';

import { ResultContent } from '~/design-system/autocomplete/results-list';
import { Dots } from '~/design-system/dots';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Date } from '~/design-system/icons/date';
import { FilteredTableView } from '~/design-system/icons/filtered-table-view';
import { Image as ImageIcon } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Trash } from '~/design-system/icons/trash';
import { Url } from '~/design-system/icons/url';
import { Input } from '~/design-system/input';
import { Menu, MenuItem } from '~/design-system/menu';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';
import { TextButton } from '~/design-system/text-button';

import { AttributeConfigurationMenu } from '~/partials/entity-page/attribute-configuration-menu';

import { TableBlockSchemaConfigurationDialog } from './table-block-schema-configuration-dialog';

// We keep track of the attributes in local state in order to quickly render
// the changes the user has made to the schema. Otherwise there will be loading
// states for several actions which will make the UI feel slow.
const optimisticAttributesAtom = atom<IEntity[]>([]);

function useOptimisticAttributes({
  entityId,
  entityName,
  spaceId,
}: {
  entityId: string;
  entityName: string | null;
  spaceId: string;
}) {
  const [optimisticAttributes, setOptimisticAttributes] = useAtom(optimisticAttributesAtom);
  const merged = useMergedData();
  const { create, remove } = useActionsStore();
  const migrateHub = useMigrateHub();

  const onAddAttribute = (attribute: IEntity) => {
    create(
      Triple.withId({
        entityId: entityId,
        entityName: attribute.name,
        attributeId: SYSTEM_IDS.ATTRIBUTES,
        attributeName: 'Attributes',
        space: spaceId,
        value: {
          type: 'entity',
          id: attribute.id,
          name: attribute.name,
        },
      })
    );

    setOptimisticAttributes([...optimisticAttributes, attribute]);
  };

  const onUpdateAttribute = (attribute: IEntity) => {
    const remappedOptimisticAttributes = optimisticAttributes.map(a => {
      if (a.id === attribute.id) {
        return attribute;
      }

      return a;
    });

    setOptimisticAttributes(remappedOptimisticAttributes);
  };

  const onRemoveAttribute = (attribute: IEntity, nameTriple?: ITriple) => {
    if (!nameTriple) {
      return;
    }

    remove(
      Triple.withId({
        attributeId: SYSTEM_IDS.ATTRIBUTES,
        attributeName: 'Attributes',
        entityId: entityId,
        entityName: entityName,
        space: spaceId,
        value: {
          type: 'entity',
          id: nameTriple.entityId,
          name: nameTriple.entityName,
        },
      })
    );

    setOptimisticAttributes(optimisticAttributes.filter(a => a.id !== attribute.id));
  };

  const onChangeAttributeValueType = (newValueTypeId: ValueTypeId, attribute: IEntity) => {
    const attributeValueTypeTriple = attribute.triples.find(t => t.attributeId === SYSTEM_IDS.VALUE_TYPE);

    if (attributeValueTypeTriple) {
      remove(attributeValueTypeTriple);

      const oldValueTypeId = attributeValueTypeTriple.value.id;

      // We want to make sure that the ID is actually one of the value types
      // before we run any migrations.
      //
      // @TODO: Is there a better way to have this encoded into the type system
      // of `value.id`?
      if (oldValueTypeId in valueTypes) {
        migrateHub.dispatch({
          type: 'CHANGE_VALUE_TYPE',
          payload: {
            attributeId: attribute.id,
            oldValueType: valueTypes[oldValueTypeId as ValueTypeId],
            newValueType: valueTypes[newValueTypeId],
          },
        });
      }
    }

    if (attribute.nameTripleSpace) {
      const newTriple = Triple.withId({
        entityId: attribute.id,
        entityName: attribute.name,
        attributeId: SYSTEM_IDS.VALUE_TYPE,
        attributeName: 'Value type',
        space: attribute.nameTripleSpace,
        value: {
          type: 'entity',
          id: newValueTypeId,
          name: valueTypeNames[newValueTypeId],
        },
      });

      const updatedTriples = [
        ...attribute.triples.filter(t => {
          return t.attributeId !== SYSTEM_IDS.VALUE_TYPE;
        }),
        newTriple,
      ];

      // Update the attribute in-place in the optimistic state
      onUpdateAttribute({
        ...attribute,
        triples: updatedTriples,
      });

      // Create a new Value Type triple with the new value type
      create(newTriple);
    }
  };

  const { data } = useQuery({
    suspense: true,
    queryKey: ['table-block-type-schema-configuration-attributes-list', entityId],
    queryFn: async () => {
      // Fetch the triples representing the Attributes for the type
      const attributeTriples = await merged.fetchTriples({
        query: '',
        first: 100,
        skip: 0,
        filter: [
          {
            field: 'entity-id',
            value: entityId,
          },
          {
            field: 'attribute-id',
            value: SYSTEM_IDS.ATTRIBUTES,
          },
        ],
      });

      // Fetch the the entities for each of the Attribute in the type
      const maybeAttributeEntities = await Promise.all(
        attributeTriples.map(t => merged.fetchEntity({ id: t.value.id }))
      );

      return maybeAttributeEntities.filter(Entity.isNonNull);
    },
  });

  // Update the modal state with the initial data for the attributes. We update this modal state optimistically
  // when users add or remove attributes.
  React.useEffect(() => {
    setOptimisticAttributes(data ?? []);
  }, [data, setOptimisticAttributes]);

  return {
    optimisticAttributes,
    onAddAttribute,
    onRemoveAttribute,
    onChangeAttributeValueType,
  };
}

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { type, spaceId, entityId } = useTableBlock();

  const isEditing = useUserIsEditing(spaceId);

  const { spaces } = useSpaces();
  const space = spaces.find(s => s.id === type.space);

  const onCopyViewId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const spaceImage = Entity.cover(space?.spaceConfig?.triples) ?? null;

  return (
    <Menu
      // using modal will prevent the menu from closing when opening up another dialog or popover
      // from within the menu
      modal
      open={isMenuOpen}
      onOpenChange={setIsMenuOpen}
      align="end"
      trigger={isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
      className="max-w-[180px] bg-white"
    >
      <MenuItem>
        <button onClick={onCopyViewId} className="inline-flex w-full items-center gap-2 px-3 py-2">
          <Copy /> <span>Copy view ID</span>
        </button>
      </MenuItem>
      <MenuItem>
        <Link href={NavUtils.toEntity(spaceId, entityId)} className="inline-flex w-full items-center gap-2 px-3 py-2">
          <Cog /> <span>View config</span>
        </Link>
      </MenuItem>
      {isEditing && (
        <TableBlockSchemaConfigurationDialog
          trigger={
            <MenuItem>
              <div className="inline-flex items-center gap-2 px-3 py-2">
                <FilteredTableView />
                <span className="text-button">Edit type</span>
              </div>
            </MenuItem>
          }
          content={
            <div className="flex flex-col gap-6 p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <Image layout="fill" objectFit="cover" src={getImagePath(spaceImage ?? '')} />
                  </div>
                  <h1 className="text-mediumTitle">{type.entityName}</h1>
                </div>

                <h2 className="text-metadata text-grey-04">
                  Making changes to this type it will affect everywhere that this type is referenced.
                </h2>
              </div>

              <React.Suspense fallback={<AddAttributeLoading />}>
                <AddAttribute />
                <SchemaAttributes />
              </React.Suspense>
            </div>
          }
        />
      )}
    </Menu>
  );
}

function AddAttributeLoading() {
  return (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-7 w-24" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-14" />
        <Skeleton className="h-9 w-[400px]" />
        <Skeleton className="h-9 w-[76px]" />
      </div>
    </div>
  );
}

const resultsListActionBarStyles = cva(
  'sticky bottom-0 flex items-center justify-between gap-2 overflow-hidden bg-white p-2 text-smallButton',
  {
    variants: {
      // We add some styling if the aciton bar is being rendered when results are present vs when results
      // are not present.
      withFullBorder: {
        false: 'rounded shadow-inner-grey-02',
        true: 'rounded rounded-tl-none rounded-tr-none shadow-inner-grey-02',
      },
    },
    defaultVariants: {
      withFullBorder: true,
    },
  }
);

function AddAttribute() {
  const { type } = useTableBlock();

  const autocomplete = useAutocomplete({
    allowedTypes: [SYSTEM_IDS.ATTRIBUTE],
  });

  const { spaces } = useSpaces();

  const { optimisticAttributes, onAddAttribute } = useOptimisticAttributes({
    entityId: type.entityId,
    entityName: type.entityName,
    spaceId: type.space,
  });

  const onSelect = (result: IEntity) => {
    autocomplete.onQueryChange('');
    onAddAttribute(result);
  };

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-bodySemibold">Add attribute</h3>
      <div className="relative">
        <Input
          placeholder="Attribute name..."
          onChange={e => autocomplete.onQueryChange(e.currentTarget.value)}
          value={autocomplete.query}
        />
        {autocomplete.query && (
          // The max-height includes extra padding for the action bar to be stuck at the bottom of the list
          // without overlapping results.
          <div className="absolute top-10 z-100 flex max-h-[188px] w-full flex-col overflow-hidden rounded bg-white shadow-inner-grey-02">
            <ResizableContainer duration={0.125}>
              <ul className="flex max-h-40 list-none flex-col justify-start overflow-y-auto overflow-x-hidden">
                {autocomplete.results.map((result, i) => (
                  <motion.li
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * i }}
                    key={result.id}
                  >
                    <ResultContent
                      key={result.id}
                      onClick={() => onSelect(result)}
                      alreadySelected={optimisticAttributes.map(a => a.id).includes(result.id)}
                      result={result}
                      spaces={spaces}
                    />
                  </motion.li>
                ))}
              </ul>

              <div
                className={resultsListActionBarStyles({
                  withFullBorder: !autocomplete.isEmpty && !autocomplete.isLoading,
                })}
              >
                <AnimatePresence mode="popLayout">
                  {autocomplete.isLoading ? (
                    <motion.span
                      key="dots"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Dots />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="attributes-found"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      {autocomplete.results.length} {pluralize('attribute', autocomplete.results.length)} found
                    </motion.span>
                  )}
                </AnimatePresence>
                <div className="flex items-baseline gap-3">
                  <TextButton>Create new attribute</TextButton>
                </div>
              </div>
            </ResizableContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function SchemaAttributes() {
  const { type } = useTableBlock();
  const { create, update } = useActionsStore();

  const {
    optimisticAttributes: attributes,
    onRemoveAttribute,
    onChangeAttributeValueType,
  } = useOptimisticAttributes({
    entityId: type.entityId,
    entityName: type.entityName,
    spaceId: type.space,
  });

  const onChangeAttributeName = (newName: string, entity: IEntity, oldNameTriple?: ITriple) => {
    if (!entity.nameTripleSpace) {
      console.error("The entity doesn't have a name triple space");
      return;
    }

    if (!oldNameTriple) {
      return create(
        Triple.withId({
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          entityId: entity.id,
          entityName: entity.name,
          space: entity.nameTripleSpace,
          value: {
            type: 'string',
            id: ID.createValueId(),
            value: newName,
          },
        })
      );
    }

    update(
      {
        ...oldNameTriple,
        entityName: newName,
        value: {
          type: 'string',
          id: oldNameTriple.value.id,
          value: newName,
        },
      },
      oldNameTriple
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-bodySemibold">Attributes</h3>
      <div className="flex flex-col gap-2">
        {attributes?.map(attributeEntity => {
          const valueTypeId: ValueTypeId | undefined = attributeEntity.triples.find(
            t => t.attributeId === SYSTEM_IDS.VALUE_TYPE
          )?.value.id as ValueTypeId;

          const nameTripleForAttribute = attributeEntity.triples.find(t => t.attributeId === SYSTEM_IDS.NAME);

          return (
            <div key={attributeEntity.id} className="flex items-center gap-4">
              {/* <div className="rounded bg-grey-01 px-5 py-2.5"> */}
              <AttributeValueTypeDropdown
                valueTypeId={valueTypeId}
                onChange={valueTypeId => onChangeAttributeValueType(valueTypeId, attributeEntity)}
              />
              {/* </div> */}
              <Input
                defaultValue={attributeEntity.name ?? ''}
                onBlur={e => onChangeAttributeName(e.currentTarget.value, attributeEntity, nameTripleForAttribute)}
              />
              {valueTypeId === SYSTEM_IDS.RELATION && (
                <AttributeConfigurationMenu
                  trigger={<Cog />}
                  attributeId={attributeEntity.id}
                  attributeName={attributeEntity.name}
                />
              )}
              <AttributeRowContextMenu
                onRemoveAttribute={() => onRemoveAttribute(attributeEntity, nameTripleForAttribute)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttributeRowContextMenu({ onRemoveAttribute }: { onRemoveAttribute: () => void }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Menu
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={<Context color="grey-04" />}
      className="max-w-[180px] bg-white"
    >
      <MenuItem>
        <button onClick={onRemoveAttribute} className="inline-flex w-full items-center gap-2 px-3 py-2">
          <Trash /> <span>Remove attribute</span>
        </button>
      </MenuItem>
    </Menu>
  );
}

function AttributeValueTypeDropdown({
  valueTypeId,
  onChange,
}: {
  valueTypeId?: ValueTypeId;
  onChange: (valueTypeId: ValueTypeId) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  const options = [
    {
      label: (
        <div className="flex items-center gap-2">
          <Text color="grey-04" />
          <p>Text</p>
        </div>
      ),
      value: SYSTEM_IDS.TEXT,
      onClick: () => onChange(SYSTEM_IDS.TEXT),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <Relation color="grey-04" />
          <p>Relation</p>
        </div>
      ),
      value: SYSTEM_IDS.RELATION,
      onClick: () => onChange(SYSTEM_IDS.RELATION),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <ImageIcon color="grey-04" />
          <p>Image</p>
        </div>
      ),
      value: SYSTEM_IDS.IMAGE,
      onClick: () => onChange(SYSTEM_IDS.IMAGE),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <Date color="grey-04" />
          <p>Date</p>
        </div>
      ),
      value: SYSTEM_IDS.DATE,
      onClick: () => onChange(SYSTEM_IDS.DATE),
    },
    {
      label: (
        <div className="flex items-center gap-2">
          <Url color="grey-04" />
          <p>Web URL</p>
        </div>
      ),
      value: SYSTEM_IDS.WEB_URL,
      onClick: () => onChange(SYSTEM_IDS.WEB_URL),
    },
  ];

  return (
    <Menu
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <button className="shadow-button">
          <div className=" flex flex-grow items-center justify-between whitespace-nowrap rounded bg-white px-3 py-2 text-button text-text shadow-inner-grey-02 hover:shadow-inner-text focus:shadow-inner-lg-text [&[data-placeholder]]:text-text">
            <ActiveTypeIcon valueTypeId={valueTypeId} />
            <Spacer width={8} />
            <ChevronDownSmall color="ctaPrimary" />
          </div>
        </button>
      }
      align="start"
      className="z-10 max-w-[160px] bg-white"
    >
      {options.map(option => (
        <MenuItem key={option.value}>
          <button onClick={option.onClick} className="inline-flex w-full items-center gap-2 px-3 py-2">
            {option.label}
          </button>
        </MenuItem>
      ))}
    </Menu>
  );
}

function ActiveTypeIcon({ valueTypeId }: { valueTypeId?: ValueTypeId }) {
  switch (valueTypeId) {
    case SYSTEM_IDS.TEXT:
      return <Text color="grey-04" />;
    case SYSTEM_IDS.RELATION:
      return <Relation color="grey-04" />;
    case SYSTEM_IDS.DATE:
      return <Date color="grey-04" />;
    case SYSTEM_IDS.IMAGE:
      return <ImageIcon color="grey-04" />;
    case SYSTEM_IDS.WEB_URL:
      return <Url color="grey-04" />;
    default:
      // We default to the Text type if an attribute has not set an explicit relation value
      // type. Ideally we force users to explicitly set a type when creating an attribute,
      // but for now we do not.
      return <Text color="grey-04" />;
  }
}

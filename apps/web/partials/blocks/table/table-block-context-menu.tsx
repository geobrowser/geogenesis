'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/legacy/image';
import pluralize from 'pluralize';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useMergedData } from '~/core/hooks/use-merged-data';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { Services } from '~/core/services';
import { SelectedEntityType } from '~/core/state/entity-table-store';
import { useLocalStore } from '~/core/state/local-store';
import { useTableBlock } from '~/core/state/table-block-store';
import { Entity as IEntity, Triple as ITriple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { getImagePath } from '~/core/utils/utils';
import { ValueType } from '~/core/value-types';

import { ResultContent } from '~/design-system/autocomplete/results-list';
import { Dots } from '~/design-system/dots';
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
import { TextButton } from '~/design-system/text-button';

import { TableBlockSchemaConfigurationDialog } from './table-block-schema-configuration-dialog';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { type, spaceId } = useTableBlock();

  const isEditing = useUserIsEditing(spaceId);

  const { spaces } = useSpaces();
  const space = spaces.find(s => s.id === spaceId);

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
        <button className="inline-flex items-center gap-2 px-3 py-2">
          <Copy /> <span>Copy view ID</span>
        </button>
      </MenuItem>
      {isEditing && (
        <TableBlockSchemaConfigurationDialog
          trigger={
            <MenuItem>
              <div className="inline-flex items-center gap-2 px-3 py-2">
                <FilteredTableView />
                <span className="text-button">Edit type schema</span>
              </div>
            </MenuItem>
          }
          content={
            <div className="flex flex-col gap-6 p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <Image
                      layout="fill"
                      objectFit="cover"
                      src={getImagePath(space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? '')}
                    />
                  </div>
                  <h1 className="text-mediumTitle">{type.entityName}</h1>
                </div>

                <h2 className="text-metadata text-grey-04">
                  Making changes to this type it will affect everywhere that this type is referenced.
                </h2>
              </div>

              <React.Suspense fallback={<AddAttributeLoading />}>
                <AddAttribute type={type} />
              </React.Suspense>

              <ErrorBoundary fallback={<p>Something went wrong...</p>}>
                <React.Suspense fallback={<p>TODO loading spinner...</p>}>
                  <SchemaAttributes type={type} />
                </React.Suspense>
              </ErrorBoundary>
            </div>
          }
        />
      )}
    </Menu>
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

function AddAttribute({ type }: { type: ITriple }) {
  const autocomplete = useAutocomplete({
    allowedTypes: [SYSTEM_IDS.ATTRIBUTE],
  });

  const { config } = Services.useServices();
  const merged = useMergedData();
  const { spaces } = useSpaces();
  const { create } = useActionsStore();

  const { data: attributeTriple } = useQuery({
    suspense: true,
    queryKey: ['table-block-type-schema-configuration-add-attribute', type.entityId],
    queryFn: () =>
      merged.fetchTriples({
        endpoint: config.subgraph,
        query: '',
        first: 100,
        skip: 0,
        filter: [
          {
            field: 'entity-id',
            value: type.entityId,
          },
        ],
      }),
  });

  const onSelect = (result: { id: string; name: string | null }) => {
    // Should be find-or-create (?)
    // 1.If result exists
    //    1a. Set selected result in some state as "SelectedAttribute"
    // 2. If result does not exist
    //    2a. Create it with name and type: Attribute in existing space
    //    2b. Set created entity in some state as "SelectedAttribute"
    //    2c. Set the Relation Value Type triple as whatever is selected
    // 3. When "+ Add" is clicked, read from state and add a new triple
    //    to the type with attribute: Attributes and value.id: SelectedAttribute.id
    //
    // Q: What do we do with the type selector?
    // A: If we're using an existing attribute it should be pre-filled with the
    //    Relation Value Type triple if it exists.
    //        If not allow the user to select a type (?) (this will add the RVT triple)
    //          How will migrations work if users can change the type?
    //            Should it only be changeable if it's a local attribute?

    create(
      Triple.withId({
        entityId: type.entityId,
        entityName: result.name,
        attributeId: SYSTEM_IDS.ATTRIBUTES,
        attributeName: 'Attributes',
        space: type.space,
        value: {
          type: 'entity',
          id: result.id,
          name: result.name,
        },
      })
    );

    autocomplete.onQueryChange('');
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
                      // @TODO: Need to pull in all attributes with local data to check if they're already selected
                      // alreadySelected={entityItemIdsSet.has(result.id)}
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
                  <TextButton
                    onClick={() => {
                      //
                    }}
                  >
                    Create new attribute
                  </TextButton>
                </div>
              </div>
            </ResizableContainer>
          </div>
        )}
      </div>
    </div>
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

function SchemaAttributes({ type }: { type: SelectedEntityType }) {
  const { config } = Services.useServices();
  const merged = useMergedData();
  const { entities } = useLocalStore();
  const { create, update } = useActionsStore();

  // We want to rerun the query below whenever we change the type id to add or remove attributes
  // from the schema.
  const localAttributeTriplesForEntityId = entities
    .find(e => e.id === type.entityId)
    ?.triples.filter(t => t.attributeId === SYSTEM_IDS.ATTRIBUTES)
    // We only want to re-fetch when the actual value id changes. The value.value will be
    // optimistically updated in the UI so we don't need to re-render to get the latest name.
    .map(t => t.value.id);

  const { data: attributeEntitiesForType } = useQuery({
    suspense: true,
    queryKey: [
      'table-block-type-schema-configuration-attributes-list',
      type.entityId,
      localAttributeTriplesForEntityId,
    ],
    queryFn: async () => {
      // Fetch the triples representing the Attributes for the type
      const attributeTriples = await merged.fetchTriples({
        endpoint: config.subgraph,
        query: '',
        first: 100,
        skip: 0,
        filter: [
          {
            field: 'entity-id',
            value: type.entityId,
          },
          {
            field: 'attribute-id',
            value: SYSTEM_IDS.ATTRIBUTES,
          },
        ],
      });

      // Fetch the the entities for each of the Attribute in the type
      const maybeAttributeEntities = await Promise.all(
        attributeTriples.map(t => merged.fetchEntity({ id: t.value.id, endpoint: config.subgraph }))
      );

      return maybeAttributeEntities.filter(Entity.isNonNull);
    },
  });

  // TODO: How we do we get the locally added attributes?
  // Couple options:
  // 1. Somehow re-run the above useQuery whenever we get new local data
  // 2. Only run the above query on mount, then merge it with any local attributes
  //    whenever we get new local data
  //
  // #1 is probably the most correct way, but it will result in a loading state briefly.

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
        {attributeEntitiesForType?.map(entity => {
          const valueTypeId: ValueType | undefined = entity.triples.find(t => t.attributeId === SYSTEM_IDS.VALUE_TYPE)
            ?.value.id;

          const nameTripleForAttribute = entity.triples.find(t => t.attributeId === SYSTEM_IDS.NAME);

          return (
            <div key={entity.id} className="flex items-center gap-4">
              <div className="rounded bg-grey-01 px-5 py-2.5">
                <AttributeValueTypeDropdown valueTypeId={valueTypeId} />
              </div>
              <Input
                defaultValue={entity.name ?? ''}
                onBlur={e => onChangeAttributeName(e.currentTarget.value, entity, nameTripleForAttribute)}
              />
              {valueTypeId === SYSTEM_IDS.RELATION && (
                <div>
                  <Cog color="grey-04" />
                </div>
              )}
              <AttributeRowContextMenu />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttributeRowContextMenu() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Menu
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={<Context color="grey-04" />}
      className="max-w-[180px] bg-white"
    >
      <MenuItem>
        <button className="inline-flex items-center gap-2 px-3 py-2">
          <Trash /> <span>Remove attribute</span>
        </button>
      </MenuItem>
    </Menu>
  );
}

function AttributeValueTypeDropdown({ valueTypeId }: { valueTypeId?: ValueType }) {
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

'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/legacy/image';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useMergedData } from '~/core/hooks/use-merged-data';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Services } from '~/core/services';
import { SelectedEntityType } from '~/core/state/entity-table-store';
import { useTableBlock } from '~/core/state/table-block-store';
import { Entity as IEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';
import { ValueType } from '~/core/value-types';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Date } from '~/design-system/icons/date';
import { Image as ImageIcon } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Skeleton } from '~/design-system/skeleton';

import { TableBlockSchemaConfigurationDialog } from './table-block-schema-configuration-dialog';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { type, spaceId } = useTableBlock();

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
      className="max-w-[180px] divide-x divide-grey-02 whitespace-nowrap bg-white"
    >
      <TableBlockSchemaConfigurationDialog
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
              <React.Suspense fallback={<AddAttributeLoading />}>
                <SchemaAttributes type={type} />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        }
      />
    </Menu>
  );
}

function AddAttribute({ type }: { type: SelectedEntityType }) {
  const autocomplete = useAutocomplete({
    allowedTypes: [SYSTEM_IDS.ATTRIBUTE],
  });

  const { config } = Services.useServices();
  const merged = useMergedData();
  const { spaces } = useSpaces();

  const { data: attributeTriple } = useQuery({
    suspense: true,
    queryKey: ['table-block-type-schema-configuration-add-attribute', type.id],
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
  };

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-bodySemibold">Add attribute</h3>
      <Input
        placeholder="Attribute name..."
        onChange={e => autocomplete.onQueryChange(e.currentTarget.value)}
        value={autocomplete.query}
      />
      <ResizableContainer duration={0.125}>
        <ResultsList>
          {autocomplete.results.map((result, i) => (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i }}
              key={result.id}
            >
              <ResultContent
                key={result.id}
                onClick={() => {
                  //
                }}
                // alreadySelected={entityItemIdsSet.has(result.id)}
                result={result}
                spaces={spaces}
              />
            </motion.div>
          ))}
        </ResultsList>
      </ResizableContainer>
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
  const { config, subgraph } = Services.useServices();
  const merged = useMergedData();

  const { data: attributeEntitiesForType } = useQuery({
    suspense: true,
    queryKey: ['table-block-type-schema-configuration-attributes-list', type.entityId],
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
        attributeTriples.map(t => subgraph.fetchEntity({ id: t.value.id, endpoint: config.subgraph }))
      );

      return maybeAttributeEntities.filter(Entity.isNonNull);
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-bodySemibold">Attributes</h3>
      <div className="flex flex-col gap-2">
        {attributeEntitiesForType?.map(e => <AttributeRow key={e.id} attribute={e} />)}
      </div>
    </div>
  );
}

function AttributeRow({ attribute }: { attribute: IEntity }) {
  const valueTypeId: ValueType | undefined = attribute.triples.find(t => t.attributeId === SYSTEM_IDS.VALUE_TYPE)?.value
    .id;

  return (
    <div className="flex items-center gap-4">
      <div className="rounded bg-grey-01 px-5 py-2.5">
        <AttributeValueTypeDropdown valueTypeId={valueTypeId} />
      </div>
      <Input value={attribute.name ?? ''} />
      {valueTypeId === SYSTEM_IDS.RELATION && (
        <div>
          <Cog color="grey-04" />
        </div>
      )}
      <div>
        <Context color="grey-04" />
      </div>
    </div>
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

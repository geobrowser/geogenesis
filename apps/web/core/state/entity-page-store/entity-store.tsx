'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { A, pipe } from '@mobily/ts-belt';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useConfiguredAttributeRelationTypes } from '~/core/hooks/use-configured-attribute-relation-types';
import { useMergedData } from '~/core/hooks/use-merged-data';
import { Services } from '~/core/services';
import { Triple as ITriple, TripleWithCollectionValue, ValueTypeId } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

import { useEntityStoreInstance } from './entity-store-provider';

export const createInitialSchemaTriples = (spaceId: string, entityId: string): ITriple[] => {
  const nameTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Name',
    attributeId: SYSTEM_IDS.NAME,
    value: {
      type: 'TEXT',
      value: '',
    },

    placeholder: true,
    hasBeenPublished: false,
    isDeleted: false,
    timestamp: Triple.timestamp(),
  });

  const descriptionTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Description',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    value: {
      type: 'TEXT',
      value: '',
    },

    placeholder: true,
    hasBeenPublished: false,
    isDeleted: false,
    timestamp: Triple.timestamp(),
  });

  const typeTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Types',
    attributeId: SYSTEM_IDS.TYPES,
    value: {
      value: '',
      type: 'ENTITY',
      name: '',
    },

    placeholder: true,
    hasBeenPublished: false,
    isDeleted: false,
    timestamp: Triple.timestamp(),
  });

  return [nameTriple, descriptionTriple, typeTriple];
};

const DEFAULT_PAGE_SIZE = 100;

export function useEntityPageStore() {
  const { spaceId, id, initialTriples } = useEntityStoreInstance();
  const { allActions } = useActionsStore();
  const merged = useMergedData();

  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: id });

  const [hiddenSchemaIds, setHiddenSchemaIds] = React.useState<string[]>([]);

  const triples = React.useMemo(() => {
    return pipe(
      Triple.merge(allActions, initialTriples),
      A.filter(t => t.entityId === id),
      triples =>
        // We may be referencing attributes/entities from other spaces whose name has changed.
        // We pass _all_ local changes instead of just the current space changes.
        Triple.withLocalNames(allActions, triples),
      A.filter(t => t.isDeleted === false)
    );
  }, [allActions, id, initialTriples]);

  const name = React.useMemo(() => {
    return Entity.name(triples) || '';
  }, [triples]);

  /*
  In the edit-events reducer, deleting the last entity of a triple will create a mock entity with no value to
  persist the Attribute field. Filtering out those entities here.
  // @TODO: typeTriple singular
  */
  const typeTriples = React.useMemo(() => {
    return triples.filter(
      triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.type === 'ENTITY' && triple.value.value !== ''
    );
  }, [triples]);

  const { data: schemaTriples } = useQuery({
    initialData: createInitialSchemaTriples(spaceId, id),
    queryKey: ['entity-page-schema-triples', spaceId, id, typeTriples],
    queryFn: async ({ signal }) => {
      if (typeTriples.length === 0) {
        return [];
      }

      // The types on an entity is only ever one triple for a given space,
      // either a collection or an entity. We need to parse the contents
      // of the triple and fetch those here.
      let typeTripleContents: string[] = [];
      const typeTriple = typeTriples[0];

      if (typeTriple.value.type === 'COLLECTION') {
        typeTripleContents = typeTriple.value.items.map(i => i.entity.id);
      }

      if (typeTriple.value.type === 'ENTITY') {
        typeTripleContents = [typeTriple.value.value];
      }

      const maybeTypeEntities = await Promise.all(
        typeTripleContents.map(typeId => {
          return merged.fetchEntity({
            signal,
            id: typeId,
          });
        })
      );

      const typeEntities = maybeTypeEntities.flatMap(e => (e ? [e] : []));

      // The value of these Attributes triple for each type can either be an
      // Entity or a Collection. We need to map to the Attribute's id and
      // name depending on the contents of the attribute.
      const attributeTriples = typeEntities
        .map(e => e.triples.find(t => t.attributeId === SYSTEM_IDS.ATTRIBUTES))
        .flatMap(t => (t ? [t] : []));

      const attributeEntityIds = attributeTriples
        .map(a => {
          if (a.value.type === 'ENTITY') {
            return [{ id: a.value.value, name: a.value.name }];
          }

          if (a.value.type === 'COLLECTION') {
            return a.value.items.map(i => ({
              id: i.entity.id,
              name: i.entity.name,
            }));
          }

          return null;
        })
        // wat
        .flatMap(e => (e ? [e] : []))
        .flat();

      // The contents returned here _should_ be a single entity and not a collection
      const valueTypesForAttributes = await Promise.all(
        attributeEntityIds.map(attribute => {
          return merged.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
            skip: 0,
            signal,
            filter: [
              {
                field: 'entity-id',
                value: attribute.id,
              },
              {
                field: 'attribute-id',
                value: SYSTEM_IDS.VALUE_TYPE,
              },
            ],
          });
        })
      );

      const valueTypeTriples = valueTypesForAttributes.flatMap(triples => triples);

      const valueTypesToAttributesMap = attributeEntityIds.reduce<Record<string, ValueTypeId | undefined>>(
        (acc, attribute) => {
          acc[attribute.id] = valueTypeTriples.find(t => t.entityId === attribute.id)?.value.value as ValueTypeId;
          return acc;
        },
        {}
      );

      const schemaTriples = attributeEntityIds.map(attribute => {
        const valueType = valueTypesToAttributesMap[attribute.id];

        return {
          ...Triple.emptyPlaceholder(spaceId, id, valueType),
          attributeId: attribute.id,
          attributeName: attribute.name,
        };
      });

      return schemaTriples;
    },
  });

  const hideSchema = React.useCallback(
    (id: string) => {
      if (!hiddenSchemaIds.includes(id)) {
        setHiddenSchemaIds([...hiddenSchemaIds, id]);
      }
    },
    [hiddenSchemaIds]
  );

  return {
    triples,
    typeTriples,

    name,
    spaceId,
    id,

    schemaTriples,
    hideSchema,
    hiddenSchemaIds,

    attributeRelationTypes,
  };
}

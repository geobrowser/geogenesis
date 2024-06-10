'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';
import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { useConfiguredAttributeRelationTypes } from '~/core/hooks/use-configured-attribute-relation-types';
import { useMergedData } from '~/core/hooks/use-merged-data';
import { useTriples } from '~/core/merged/triples';
import { Triple as ITriple, ValueTypeId } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triples } from '~/core/utils/triples';
import { Value } from '~/core/utils/value';

import {
  activeTriplesForEntityIdSelector,
  createTriplesForEntityAtom,
  localTriplesAtom,
} from '../actions-store/actions-store';
import { useEntityStoreInstance } from './entity-store-provider';

export const createInitialSchemaTriples = (spaceId: string, entityId: string): ITriple[] => {
  const nameTriple = Triples.withId({
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
    timestamp: Triples.timestamp(),
  });

  const descriptionTriple = Triples.withId({
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
    timestamp: Triples.timestamp(),
  });

  const typeTriple = Triples.withId({
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
    timestamp: Triples.timestamp(),
  });

  return [nameTriple, descriptionTriple, typeTriple];
};

const DEFAULT_PAGE_SIZE = 100;

export function useEntityPageStore() {
  const { spaceId, id, initialTriples } = useEntityStoreInstance();
  const merged = useMergedData();

  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: id });

  const [hiddenSchemaIds, setHiddenSchemaIds] = React.useState<string[]>([]);
  const [schemaTriples, setSchemaTriples] = React.useState(createInitialSchemaTriples(spaceId, id));

  const triples = useTriples(
    React.useMemo(
      () => ({
        mergeWith: initialTriples,
        selector: activeTriplesForEntityIdSelector(id),
      }),
      [initialTriples, id]
    )
  );

  const name = React.useMemo(() => {
    return Entity.name(triples) ?? '';
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

  useQuery({
    initialData: createInitialSchemaTriples(spaceId, id),
    queryKey: ['entity-page-schema-triples', spaceId, id, typeTriples],
    queryFn: async ({ signal }) => {
      if (typeTriples.length === 0) {
        return [];
      }

      // The types on an entity is only ever one triple for a given space,
      // either a collection or an entity. We need to parse the contents
      // of the triple and fetch those here.
      const typeTripleContents = Value.idsForEntityorCollectionItems(typeTriples[0]);

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
        .map(a => Value.entitiesForEntityOrCollectionItems(a))
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
          ...Triples.emptyPlaceholder(spaceId, id, valueType),
          attributeId: attribute.id,
          attributeName: attribute.name,
        };
      });

      // We're setting the schema triples in state instead of using the returned useQuery value
      // since useQuery doesn't do a _great_ job of persisting the previous query data for the
      // current UX that we have, even when using `keepPreviousData`.
      setSchemaTriples(schemaTriples);
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

'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useConfiguredAttributeRelationTypes } from '~/core/hooks/use-configured-attribute-relation-types';
import { Services } from '~/core/services';
import { AppEntityValue, AppTriple } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';
import { ValueTypeId } from '~/core/value-types';

import { useEntityStoreInstance } from './entity-store-provider';

export const createInitialSchemaTriples = (spaceId: string, entityId: string): AppTriple[] => {
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
      id: '',
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
  const { subgraph } = Services.useServices();

  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: id });

  const [hiddenSchemaIds, setHiddenSchemaIds] = React.useState<string[]>([]);

  const triples = React.useMemo(() => {
    return pipe(
      allActions,
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
  */
  const typeTriples = React.useMemo(() => {
    return triples.filter(
      triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.type === 'ENTITY' && triple.value.id !== ''
    );
  }, [triples]);

  const { data: schemaTriples } = useQuery({
    initialData: createInitialSchemaTriples(spaceId, id),
    queryKey: ['entity-page-schema-triples', spaceId, id, typeTriples],
    queryFn: async ({ signal }) => {
      if (typeTriples.length === 0) {
        return [];
      }

      const attributesOnType = await Promise.all(
        typeTriples.map(triple => {
          return subgraph.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
            signal,
            skip: 0,
            filter: [
              {
                field: 'entity-id',
                value: triple.value.type === 'ENTITY' ? triple.value.id : '',
              },
              {
                field: 'attribute-id',
                value: SYSTEM_IDS.ATTRIBUTES,
              },
            ],
          });
        })
      );

      const attributeTriples = attributesOnType.flatMap(triples => triples);

      // @TODO: We can get the value type in the above query and parse it here instead
      // of making another query.
      const valueTypesForAttributes = await Promise.all(
        attributeTriples.map(attribute => {
          return subgraph.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
            skip: 0,
            signal,
            filter: [
              {
                field: 'entity-id',
                value: attribute.value.type === 'ENTITY' ? attribute.value.id : '',
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

      const valueTypesToAttributesMap = attributeTriples.reduce<Record<string, ValueTypeId | undefined>>(
        (acc, attribute) => {
          acc[attribute.value.id] = valueTypeTriples.find(t => t.entityId === attribute.value.id)?.value
            .id as ValueTypeId;
          return acc;
        },
        {}
      );

      const schemaTriples = attributeTriples.map(attribute => {
        const valueType = valueTypesToAttributesMap[attribute.value.id];

        return {
          ...Triple.emptyPlaceholder(spaceId, id, valueType),
          attributeId: attribute.value.id,
          attributeName: Value.nameOfEntityValue(attribute),
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

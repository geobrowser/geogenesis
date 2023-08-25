'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { RelationValueType, useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Merged } from '~/core/merged';
import { Services } from '~/core/services';
import { useActionsStoreInstance } from '~/core/state/actions-store';
import { useLocalStoreInstance } from '~/core/state/local-store';
import { Entity } from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { NavUtils } from '~/core/utils/utils';

import { ResultContent } from '~/design-system/autocomplete/results-list';
import { SquareButton } from '~/design-system/button';
import { DeletableChipButton } from '~/design-system/chip';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';

interface Props {
  // This is the entityId of the attribute being configured with a relation type.
  attributeId: string;
  attributeName: string | null;
}

export function AttributeConfigurationMenu({ attributeId, attributeName }: Props) {
  const [open, setOpen] = React.useState(false);
  const localStore = useLocalStoreInstance();
  const store = useActionsStoreInstance();

  const { subgraph, config } = Services.useServices();

  const merged = React.useMemo(
    () =>
      new Merged({
        store,
        localStore,
        subgraph,
      }),
    [store, localStore, subgraph]
  );

  // To add the relation value type triple to the correct space we need to fetch
  // the attribute and read the space off one of the triples.
  //
  // The attribute being fetched might only exist locally so we need to use the merged
  // API to fetch both local and remote data.
  const { data: tripleForAttributeId } = useQuery({
    queryKey: ['attribute-search', attributeId],
    queryFn: () =>
      merged.fetchTriples({
        query: '',
        first: 1,
        skip: 0,
        endpoint: config.subgraph,
        filter: [
          {
            field: 'entity-id',
            value: attributeId,
          },
        ],
      }),
  });

  const spaceIdForAttribute = tripleForAttributeId?.[0].space ?? '';

  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<SquareButton icon="cog" />}>
      <div className="flex flex-col gap-2 bg-white">
        <h1 className="px-2 pt-2 text-metadataMedium">Add relation types (optional)</h1>
        <AttributeSearch
          attributeId={attributeId}
          attributeName={attributeName}
          attributeSpaceId={spaceIdForAttribute}
        />
      </div>
    </Menu>
  );
}

function AttributeSearch({ attributeId, attributeName, attributeSpaceId }: Props & { attributeSpaceId: string }) {
  const { attributeRelationTypes } = useEntityPageStore();
  const { create, remove } = useActionsStore();

  const autocomplete = useAutocomplete({
    allowedTypes: [SYSTEM_IDS.SCHEMA_TYPE],
  });

  const { spaces } = useSpaces();

  const relationValueTypesForAttribute = attributeRelationTypes[attributeId] ?? [];

  const alreadySelectedTypes = relationValueTypesForAttribute.map(st => st.typeId);

  const onSelect = async (result: Entity) => {
    create(
      Triple.withId({
        entityId: attributeId,
        attributeId: SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
        attributeName: 'Relation Value Types',
        entityName: attributeName,

        // Ensure that we create the triple for the relation value type in the same space
        // as the attribute itself. Eventually we might want space-scoped triples for data
        // in which case we would want to set triple in the current space instead.
        space: attributeSpaceId,
        value: {
          type: 'entity',
          id: result.id,
          name: result.name,
        },
      })
    );
  };

  const onRemove = ({ typeId, spaceIdOfAttribute, typeName }: RelationValueType) => {
    remove(
      Triple.withId({
        entityId: attributeId,
        attributeId: SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
        attributeName: 'Relation Value Types',
        entityName: attributeName,
        space: spaceIdOfAttribute,
        value: {
          type: 'entity',
          id: typeId,
          name: typeName,
        },
      })
    );
  };

  return (
    <Command label="Type search">
      <div className="mb-2 px-2">
        <Input onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-2">
        {relationValueTypesForAttribute.map(st => (
          <DeletableChipButton
            href={NavUtils.toEntity(st.spaceIdOfAttribute, st.typeId)}
            onClick={() => onRemove(st)}
            key={st.typeId}
          >
            {st.typeName ?? st.typeId}
          </DeletableChipButton>
        ))}
      </div>
      <Command.List>
        {autocomplete.results.slice(0, 5).map(result => (
          <Command.Item key={result.id}>
            <ResultContent
              alreadySelected={alreadySelectedTypes.includes(result.id)}
              withDescription={false}
              result={result}
              spaces={spaces}
              onClick={() => onSelect(result)}
            />
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

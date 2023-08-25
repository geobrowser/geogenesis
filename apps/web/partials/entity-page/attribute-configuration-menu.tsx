'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { Command } from 'cmdk';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { RelationValueType, useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useSpaces } from '~/core/hooks/use-spaces';
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

  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<SquareButton icon="cog" />}>
      <div className="flex flex-col gap-2 bg-white">
        <h1 className="px-2 pt-2 text-metadataMedium">Add relation types (optional)</h1>
        <AttributeSearch attributeId={attributeId} attributeName={attributeName} />
      </div>
    </Menu>
  );
}

function AttributeSearch({ attributeId, attributeName }: Props) {
  const { attributeRelationTypes } = useEntityPageStore();

  const { create, remove } = useActionsStore();

  const autocomplete = useAutocomplete({
    allowedTypes: [SYSTEM_IDS.SCHEMA_TYPE],
  });

  const { spaces } = useSpaces();

  const relationValueTypesForAttribute = attributeRelationTypes[attributeId] ?? [];

  const alreadySelectedTypes = relationValueTypesForAttribute.map(st => st.typeId);

  const onSelect = (result: Entity) => {
    autocomplete.onQueryChange('');

    create(
      Triple.withId({
        entityId: attributeId,
        attributeId: SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
        attributeName: 'Relation Value Types',
        entityName: attributeName,
        space: result.nameTripleSpace ?? '',
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
        space: spaceIdOfAttribute, // @TODO: This should the spaceId of the attribute, not the type.
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

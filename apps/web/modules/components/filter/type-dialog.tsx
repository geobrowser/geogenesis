import { SYSTEM_IDS } from '@geogenesis/ids';
import { useState } from 'react';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { Input } from '~/modules/design-system/input';
import { TextButton } from '~/modules/design-system/text-button';
import { SelectedEntityType, useEntityTable } from '~/modules/entity';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { useEditable } from '~/modules/stores/use-editable';
import { Entity } from '~/modules/types';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { ResultContent, ResultItem, ResultsList } from '../entity/autocomplete/results-list';

interface Props {
  handleSelect: (type: SelectedEntityType) => void;
  spaceId: string;
  types: SelectedEntityType[];
}

type TypeDialogMode = 'current-space' | 'foreign-space';

export function TypeDialog({ handleSelect, spaceId }: Props) {
  const autocomplete = useAutocomplete({
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      { field: 'not-space-id', value: spaceId },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });
  const entityTableStore = useEntityTable();
  const { isEditor } = useAccessControl(spaceId);
  const { editable } = useEditable();
  const { spaces } = useSpaces();

  const [entityName, setEntityName] = useState('');
  const [mode, setMode] = useState<TypeDialogMode>('current-space');

  const filteredTypes = entityTableStore.types.filter(type =>
    (type.entityName || '').toLowerCase().includes(entityName.toLowerCase())
  );

  const handleSearchChange = (value: string) => {
    if (mode === 'foreign-space') {
      autocomplete.onQueryChange(value);
    }
    setEntityName(value);
  };

  const updateMode = (mode: TypeDialogMode) => {
    setMode(mode);
    if (mode === 'foreign-space') {
      autocomplete.onQueryChange(entityName);
    }
  };

  const createForeignType = (typeEntity: Entity) => {
    const foreignTypeTriple = typeEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.id === SYSTEM_IDS.SCHEMA_TYPE
    );

    if (!foreignTypeTriple) return;

    entityTableStore.createForeignType(foreignTypeTriple);
    setEntityName('');
    handleSelect(foreignTypeTriple);
  };

  const createType = () => {
    if (entityName.length === 0) {
      return;
    }
    const newType = entityTableStore.createType(entityName);
    setEntityName('');
    handleSelect(newType);
  };

  const spaceTypeIds = entityTableStore.types.map(type => type.entityId);

  // Prevent non-types or current space types from showing up in the autocomplete results
  const filteredAutocompleteResults = autocomplete.results.filter(result => {
    const typeIds = result.triples.map(triple => triple.value.id);
    return !spaceTypeIds.includes(result.id) && typeIds.includes(SYSTEM_IDS.SCHEMA_TYPE);
  });

  const resultCount = mode === 'current-space' ? filteredTypes.length : filteredAutocompleteResults.length;

  const noResultsFound =
    (mode === 'current-space' && filteredTypes.length === 0) ||
    (mode === 'foreign-space' && filteredAutocompleteResults.length === 0);

  return (
    <div>
      <div className="flex items-center justify-between p-2">
        <Text variant="smallButton">{mode === 'current-space' ? 'All types' : 'Add type from another space'}</Text>
        {mode === 'foreign-space' ? <TextButton onClick={() => updateMode('current-space')}>Back</TextButton> : null}
      </div>
      <div className="px-2">
        <Input value={entityName} onChange={e => handleSearchChange(e.currentTarget.value)} />
      </div>
      <ResultsList className="max-h-96 overflow-y-auto px-0">
        {mode === 'current-space'
          ? filteredTypes.map(type => (
              <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                {type.entityName}
              </ResultItem>
            ))
          : filteredAutocompleteResults.map((result, i) => (
              <ResultContent
                key={result.id}
                onClick={() => {
                  createForeignType(result);
                }}
                alreadySelected={filteredTypes.some(type => type.id === result.id)}
                result={result}
                spaces={spaces}
              />
            ))}
      </ResultsList>
      {noResultsFound && <Spacer height={8} />}
      <div className="flex justify-between border-t border-grey-02 px-2 pt-2 pb-2">
        <Text variant="smallButton" color="grey-04">
          {resultCount} Types
        </Text>
        {isEditor && editable && (
          <div className="flex gap-2">
            <TextButton onClick={() => updateMode('foreign-space')} className="cursor-pointer">
              Add from space
            </TextButton>
            <TextButton className="cursor-pointer" onClick={createType}>
              Create type
            </TextButton>
          </div>
        )}
      </div>
    </div>
  );
}

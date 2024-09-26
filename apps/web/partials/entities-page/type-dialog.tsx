'use client';

import { SYSTEM_IDS } from '@geobrowser/gdk';

import { useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useSearch } from '~/core/hooks/use-search';
import { SearchResult } from '~/core/io/dto/search';
import { useEditable } from '~/core/state/editable-store';
import { useEntityTable } from '~/core/state/entity-table-store/entity-table-store';
import { useTypesStore } from '~/core/state/types-store/types-store';
import { GeoType } from '~/core/types';

import { ResultContent, ResultItem, ResultsList } from '~/design-system/autocomplete/results-list';
import { Input } from '~/design-system/input';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { TextButton } from '~/design-system/text-button';

interface Props {
  handleSelect: (type: GeoType) => void;
  spaceId: string;
}

type TypeDialogMode = 'current-space' | 'foreign-space';

export function TypeDialog({ handleSelect, spaceId }: Props) {
  const autocomplete = useSearch({
    filterByTypes: [SYSTEM_IDS.SCHEMA_TYPE],
  });
  const { types } = useTypesStore();
  const entityTableStore = useEntityTable();
  const { isEditor } = useAccessControl(spaceId);
  const { editable } = useEditable();

  const [entityName, setEntityName] = useState('');
  const [mode, setMode] = useState<TypeDialogMode>('current-space');

  const filteredTypes = types.filter(type => (type.entityName || '').toLowerCase().includes(entityName.toLowerCase()));

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

  const createForeignType = (typeEntity: SearchResult) => {
    // @TODO: Fix
    return;
    // const foreignTypeTriple = typeEntity.triples.find(
    //   triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.value === SYSTEM_IDS.SCHEMA_TYPE
    // );

    // if (!foreignTypeTriple) return;

    // entityTableStore.createForeignType(foreignTypeTriple);
    // setEntityName('');
    // handleSelect(foreignTypeTriple);
  };

  const createType = () => {
    if (entityName.length === 0) {
      return;
    }
    const newType = entityTableStore.createType(entityName);
    setEntityName('');
    handleSelect(newType);
  };

  const spaceTypeIds = types.map(type => type.entityId);

  const resultCount = mode === 'current-space' ? filteredTypes.length : autocomplete.results.length;

  const noResultsFound =
    (mode === 'current-space' && filteredTypes.length === 0) ||
    (mode === 'foreign-space' && autocomplete.results.length === 0);

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
              <ResultItem onClick={() => handleSelect(type)} key={type.entityId}>
                {type.entityName}
              </ResultItem>
            ))
          : autocomplete.results.map(result => (
              <ResultContent
                key={result.id}
                onClick={() => {
                  createForeignType(result);
                }}
                alreadySelected={filteredTypes.some(type => type.entityId === result.id)}
                result={result}
              />
            ))}
      </ResultsList>
      {noResultsFound && <Spacer height={8} />}
      <div className="flex justify-between border-t border-grey-02 px-2 pb-2 pt-2">
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

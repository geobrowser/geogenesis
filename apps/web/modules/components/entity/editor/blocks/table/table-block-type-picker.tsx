import * as React from 'react';

import { Input } from '~/modules/design-system/input';
import { Text } from '~/modules/design-system/text';
import { SelectedEntityType } from '~/modules/entity';
import { ResultItem, ResultsList } from '../../../autocomplete/results-list';
import { Spacer } from '~/modules/design-system/spacer';
import { useTypesStore } from '~/modules/type/types-store';

interface Props {
  handleSelect: (type: SelectedEntityType) => void;
}

export function TableBlockTypePicker({ handleSelect }: Props) {
  const { types } = useTypesStore();
  const [entityName, setEntityName] = React.useState('');
  const filteredTypes = types.filter(type => (type.entityName || '').toLowerCase().includes(entityName.toLowerCase()));
  const resultCount = filteredTypes.length;
  const noResultsFound = filteredTypes.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between p-2">
        <Text variant="smallButton">All types</Text>
      </div>
      <div className="px-2">
        <Input value={entityName} onChange={e => setEntityName(e.currentTarget.value)} />
      </div>
      <ResultsList className="max-h-96 overflow-y-auto">
        {filteredTypes.map(type => (
          <ResultItem onClick={() => handleSelect(type)} key={type.id}>
            {type.entityName}
          </ResultItem>
        ))}
      </ResultsList>
      {noResultsFound && <Spacer height={8} />}
      <div className="flex justify-between border-t border-grey-02 px-2 pt-2 pb-2">
        <Text variant="smallButton" color="grey-04">
          {resultCount} Types
        </Text>
      </div>
    </div>
  );
}

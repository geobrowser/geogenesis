import * as React from 'react';
import { SquareButton } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Command } from 'cmdk';

import { Menu } from '~/modules/design-system/menu';
import { useAutocomplete } from '~/modules/search';
import { ResultContent } from './autocomplete/results-list';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { DeletableChipButton } from '~/modules/design-system/chip';
import { NavUtils } from '~/modules/utils';
import { Entity } from '~/modules/types';

export function AttributeConfigurationMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<SquareButton icon="cog" />}>
      <div className="flex flex-col gap-2 bg-white">
        <h1 className="px-2 pt-2 text-metadataMedium">Add relation types (optional)</h1>
        <AttributeSearch />
      </div>
    </Menu>
  );
}

function AttributeSearch() {
  const [selectedTypes, setSelectedTypes] = React.useState<
    { typeId: string; typeName: string | null; spaceId: string }[]
  >([]);

  const autocomplete = useAutocomplete();
  const { spaces } = useSpaces();

  const alreadySelectedTypes = selectedTypes.map(st => st.typeId);

  const onSelect = (result: Entity) => {
    autocomplete.onQueryChange('');
    setSelectedTypes(prev => [
      ...prev,
      {
        typeId: result.id,
        typeName: result.name,
        spaceId: result.nameTripleSpace ?? '',
      },
    ]);
  };

  return (
    <Command label="Type search">
      <div className="mb-2 px-2">
        <Input onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-2">
        {selectedTypes.map(st => (
          <DeletableChipButton
            href={NavUtils.toEntity(st.spaceId, st.typeId)}
            onClick={() => {
              //
            }}
            key={st.typeId}
          >
            {st.typeName ?? st.typeId}
          </DeletableChipButton>
        ))}
      </div>
      <Command.List>
        {autocomplete.results.map(result => (
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

import * as React from 'react';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { SquareButton } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Command } from 'cmdk';

import { Menu } from '~/modules/design-system/menu';
import { useAutocomplete } from '~/modules/search';
import { ResultContent } from './autocomplete/results-list';
import { useSpaces } from '~/modules/spaces/use-spaces';

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
  const autocomplete = useAutocomplete();
  const { spaces } = useSpaces();

  return (
    <Command label="Type search">
      <div className="px-2 pb-2">
        <Input onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} />
      </div>
      <Command.List>
        {autocomplete.results.map(result => (
          <Command.Item key={result.id}>
            <ResultContent
              withDescription={false}
              result={result}
              spaces={spaces}
              onClick={() => {
                //
              }}
            />
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

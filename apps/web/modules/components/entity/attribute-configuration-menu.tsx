import * as React from 'react';
import { SquareButton } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';

import { Menu } from '~/modules/design-system/menu';

export function AttributeConfigurationMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<SquareButton icon="cog" />}>
      <div className="flex flex-col gap-2 bg-white p-2">
        <h1 className="text-metadataMedium">Add relation types (optional)</h1>
        <Input />
      </div>
    </Menu>
  );
}

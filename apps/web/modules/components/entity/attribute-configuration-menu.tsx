import * as React from 'react';
import { SquareButton } from '~/modules/design-system/button';

import { Menu } from '~/modules/design-system/menu';

export function AttributeConfigurationMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<SquareButton icon="close" />}>
      Hello world
    </Menu>
  );
}

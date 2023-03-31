import * as React from 'react';

import { Icon } from '~/modules/design-system/icon';
import { Menu } from '~/modules/design-system/menu';

interface Props {
  children: React.ReactNode;
}

export function HistoryPanel({ children }: Props) {
  const [open, onOpenChange] = React.useState(false);

  return (
    <Menu open={open} onOpenChange={onOpenChange} trigger={<Icon icon="history" color="grey-04" />}>
      {children}
    </Menu>
  );
}

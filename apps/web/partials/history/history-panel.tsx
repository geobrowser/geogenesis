'use client';

import * as React from 'react';

import { History } from '~/design-system/icons/history';
import { Menu } from '~/design-system/menu';

interface Props {
  children: React.ReactNode;
}

export function HistoryPanel({ children }: Props) {
  const [open, onOpenChange] = React.useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      trigger={<History color="grey-04" />}
      side="bottom"
      className="max-h-[320px] overflow-y-scroll"
    >
      {children}
    </Menu>
  );
}

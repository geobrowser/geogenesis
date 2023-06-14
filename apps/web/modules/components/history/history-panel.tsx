import * as React from 'react';

import { Icon } from '~/modules/design-system/icon';
import { Menu } from '~/modules/design-system/menu';
import { HistoryLoading } from './history-loading';
import { HistoryEmpty } from './history-empty';

interface Props {
  isLoading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}

export function HistoryPanel({ children, isLoading, isEmpty }: Props) {
  const [open, onOpenChange] = React.useState(false);

  const getHistoryContent = () => {
    if (isLoading) {
      return <HistoryLoading />;
    }

    if (isEmpty) {
      return <HistoryEmpty />;
    }

    return children;
  };

  return (
    <Menu open={open} onOpenChange={onOpenChange} trigger={<Icon icon="history" color="grey-04" />} side="bottom">
      {getHistoryContent()}
    </Menu>
  );
}

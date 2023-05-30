import * as React from 'react';
import { Icon } from '~/modules/design-system/icon';
import { Menu } from '~/modules/design-system/menu';

interface Props {
  children: React.ReactNode;
}

export function EntityPageContextMenu({ children }: Props) {
  const [open, onOpenChange] = React.useState(false);

  return (
    <Menu
      className="w-[160px]"
      open={open}
      onOpenChange={onOpenChange}
      trigger={<Icon icon="context" color="grey-04" />}
      side="bottom"
    >
      {children}
    </Menu>
  );
}

interface EntityPageContextMenuItemProps {
  children: React.ReactNode;
  onClick: () => void;
}

export function EntityPageContextMenuItem({ children, onClick }: EntityPageContextMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full divide-y divide-divider bg-white px-2 py-2 text-button text-grey-04 hover:bg-bg hover:text-text"
    >
      {children}
    </button>
  );
}

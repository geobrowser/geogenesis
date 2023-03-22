import { Icon } from '~/modules/design-system/icon';
import { Menu } from '~/modules/design-system/menu';

interface Props {
  children: React.ReactNode;
}

export function HistoryPanel({ children }: Props) {
  return <Menu trigger={<Icon icon="history" color="grey-04" />}>{children}</Menu>;
}

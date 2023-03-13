import { Icon } from '~/modules/design-system/icon';
import { Panel } from '~/modules/design-system/panel';

interface Props {
  children: React.ReactNode;
}

export function HistoryPanel({ children }: Props) {
  return <Panel trigger={<Icon icon="history" color="grey-04" />}>{children}</Panel>;
}

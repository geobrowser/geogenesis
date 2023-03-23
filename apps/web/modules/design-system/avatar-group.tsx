import clsx from 'classnames';

interface Props {
  children: React.ReactNode;
}

export function AvatarGroup({ children }: Props) {
  return <ul className="flex items-center -space-x-2">{children}</ul>;
}

function AvatarGroupItem({ children, first }: Props) {
  return (
    <li className={clsx('relative box-content h-3 w-3 overflow-hidden rounded-full border border-white')}>
      {children}
    </li>
  );
}

AvatarGroup.Item = AvatarGroupItem;

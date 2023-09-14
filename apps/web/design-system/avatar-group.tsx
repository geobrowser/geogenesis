import * as React from 'react';

interface Props {
  children: React.ReactNode;
}

export function AvatarGroup({ children }: Props) {
  return <ul className="flex items-center -space-x-2">{children}</ul>;
}

function AvatarGroupItem({ children }: Props) {
  return (
    <li className="relative box-content h-3 w-3 overflow-hidden rounded-full border-2 border-white">{children}</li>
  );
}

AvatarGroup.Item = AvatarGroupItem;

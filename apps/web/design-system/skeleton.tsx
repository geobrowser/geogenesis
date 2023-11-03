import cn from 'classnames';

import * as React from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  radius?: 'rounded-full' | 'rounded-sm';
}

export function Skeleton({ className, radius = 'rounded-sm', ...props }: Props) {
  return <div className={cn(`animate-pulse bg-grey-02 ${radius}`, className)} {...props} />;
}

import cn from 'classnames';

import * as React from 'react';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-sm bg-grey-02', className)} {...props} />;
}

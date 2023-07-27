import * as React from 'react';
import cx from 'classnames';

import { textStyles } from '~/design-system/theme/typography';
import type { TypographyName } from '~/design-system/theme/typography';

type Props = React.ComponentPropsWithoutRef<'div'> & {
  shouldTruncate?: boolean;
  maxLines?: number;
  variant?: TypographyName;
};

export const Truncate = ({
  shouldTruncate = false,
  maxLines = 1,
  variant = 'body',
  className = '',
  ...rest
}: Props) => {
  if (maxLines > 6) throw new Error(`Maximum lines is currently 6.`);

  return (
    <div
      className={cx(shouldTruncate && clampClassName[maxLines], textStyles[variant], 'w-full leading-none', className)}
      {...rest}
    />
  );
};

const clampClassName: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

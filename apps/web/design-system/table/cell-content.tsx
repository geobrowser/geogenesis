import * as React from 'react';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { Text } from '../text';
import { Truncate } from '../truncate';

interface Props {
  value: string;
  isExpanded?: boolean;
  href?: string;
}

export function CellContent({ isExpanded, value, href }: Props) {
  const content = href ? (
    <Link
      href={href}
      className="block min-h-[22px] break-words text-tableCell text-ctaHover hover:underline hover:decoration-ctaHover"
    >
      {value}
    </Link>
  ) : (
    <Text variant="tableCell" className="block min-h-[22px] break-words">
      {value}
    </Text>
  );

  return (
    <Truncate maxLines={3} shouldTruncate={!isExpanded}>
      {content}
    </Truncate>
  );
}

import Link from 'next/link';

import * as React from 'react';

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
      className="block break-words text-tableCell text-ctaPrimary transition-colors duration-150 ease-in-out hover:text-ctaHover hover:underline hover:decoration-ctaHover"
    >
      {value}
    </Link>
  ) : (
    <Text variant="tableCell" className="block break-words">
      {value}
    </Text>
  );

  return (
    <Truncate maxLines={3} shouldTruncate={!isExpanded}>
      {content}
    </Truncate>
  );
}

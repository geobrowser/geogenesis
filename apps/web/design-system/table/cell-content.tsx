import * as React from 'react';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { Text } from '../text';
import { Truncate } from '../truncate';

interface Props {
  value: string;
  isExpanded?: boolean;
  href?: string;
}

const tableCellBreakable =
  'block min-h-[22px] min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-tableCell';

export function CellContent({ isExpanded, value, href }: Props) {
  const content = href ? (
    <Link
      href={href}
      className={`${tableCellBreakable} text-ctaHover hover:underline hover:decoration-ctaHover`}
    >
      {value}
    </Link>
  ) : (
    <Text variant="tableCell" className={tableCellBreakable}>
      {value}
    </Text>
  );

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      {isExpanded ? (
        content
      ) : (
        <Truncate maxLines={3} shouldTruncate>
          {content}
        </Truncate>
      )}
    </div>
  );
}

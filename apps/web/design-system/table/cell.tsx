'use client';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { RightArrowLongSmall } from '../icons/right-arrow-long-small';
import { editingPropertiesAtom } from '~/atoms';

interface Props {
  href?: string;
  children: React.ReactNode;
  width: number;
  isLinkable?: boolean;
  isShown?: boolean;
  isEditMode?: boolean;
}

export function TableCell({ children, width, isLinkable, href, isShown, isEditMode }: Props) {
  const isEditingColumns = useAtomValue(editingPropertiesAtom);
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <td
      className={cx(
        !isShown ? (!isEditingColumns || !isEditMode ? 'hidden' : '!bg-grey-01 !text-grey-03') : null,
        'min-h-[40px] border-b border-grey-02 bg-transparent p-[10px] align-top'
      )}
      style={{
        maxWidth: width,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      width={width}
    >
      <div className="relative h-full w-full leading-none">
        <div className="flex items-center gap-2">{children}</div>
        {isHovered && (
          <div className="absolute right-0 top-0 z-10 flex items-center gap-1">
            {isLinkable && href && (
              <Link href={href}>
                <SquareButton icon={<RightArrowLongSmall />} />
              </Link>
            )}
          </div>
        )}
      </div>
    </td>
  );
}

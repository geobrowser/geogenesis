'use client';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ContractSmall } from '../icons/contract-small';
import { ExpandSmall } from '../icons/expand-small';
import { RightArrowLongSmall } from '../icons/right-arrow-long-small';
import { editingPropertiesAtom } from '~/atoms';

interface Props {
  href?: string;
  children: React.ReactNode;
  width: number;
  isExpandable?: boolean;
  isLinkable?: boolean;
  isExpanded: boolean;
  toggleExpanded: () => void;
  isShown?: boolean;
  isEditMode?: boolean;
}

export function TableCell({
  children,
  width,
  isExpandable,
  isLinkable,
  href,
  toggleExpanded,
  isExpanded,
  isShown,
  isEditMode,
}: Props) {
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
            {isExpandable && (
              <SquareButton onClick={toggleExpanded} icon={isExpanded ? <ContractSmall /> : <ExpandSmall />} />
            )}
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

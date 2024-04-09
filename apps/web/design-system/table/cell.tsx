'use client';

import cx from 'classnames';
import { useAtomValue } from 'jotai';
import Link from 'next/link';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';

import { ContractSmall } from '../icons/contract-small';
import { ExpandSmall } from '../icons/expand-small';
import { RightArrowLongSmall } from '../icons/right-arrow-long-small';
import { editingColumnsAtom } from '~/atoms';

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
  const isEditingColumns = useAtomValue(editingColumnsAtom);
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <td
      className={cx(
        !isShown ? (!isEditingColumns || !isEditMode ? 'hidden' : '!bg-grey-01 !text-grey-03') : null,
        'min-h-[40px] overflow-clip border border-grey-02 bg-transparent p-[10px] align-top'
      )}
      style={{
        maxWidth: width,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      width={width}
    >
      <div className="relative flex h-full w-full items-center justify-between leading-none">
        {children}
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

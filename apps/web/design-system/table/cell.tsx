'use client';

import Link from 'next/link';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';

interface Props {
  href?: string;
  children: React.ReactNode;
  width: number;
  isExpandable?: boolean;
  isLinkable?: boolean;
  isExpanded: boolean;
  toggleExpanded: () => void;
}

export function TableCell({ children, width, isExpandable, isLinkable, href, toggleExpanded, isExpanded }: Props) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <td
      className="min-h-[40px] border border-grey-02 bg-transparent p-[10px] align-top"
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
              <SquareButton onClick={toggleExpanded} icon={isExpanded ? 'contractSmall' : 'expandSmall'} />
            )}
            {isLinkable && href && (
              <Link href={href}>
                <SquareButton icon="rightArrowLongSmall" />
              </Link>
            )}
          </div>
        )}
      </div>
    </td>
  );
}

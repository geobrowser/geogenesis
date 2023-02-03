import Link from 'next/link';
import React from 'react';
import { SquareButton } from '~/modules/design-system/button';

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
      className="align-top bg-transparent border border-grey-02 p-[10px]"
      style={{
        maxWidth: width,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      width={width}
    >
      <div className="relative">
        {children}
        {isHovered && (
          <div className="absolute flex items-center right-0 top-0 gap-1 z-10">
            {isExpandable && (
              <SquareButton
                onClick={toggleExpanded}
                icon={isExpanded ? 'contractSmall' : 'expandSmall'}
                variant="secondary"
              />
            )}
            {isLinkable && href && (
              <Link href={href} passHref>
                <a>
                  <SquareButton icon="rightArrowLongSmall" variant="secondary" />
                </a>
              </Link>
            )}
          </div>
        )}
      </div>
    </td>
  );
}

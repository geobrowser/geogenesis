import * as React from 'react';
import Link from 'next/link';

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
      className="border border-grey-02 bg-transparent px-[10px] py-[5px] align-top"
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
          <div className="absolute right-0 top-0 z-10 flex items-center gap-1">
            {isExpandable && (
              <SquareButton onClick={toggleExpanded} icon={isExpanded ? 'contractSmall' : 'expandSmall'} />
            )}
            {isLinkable && href && (
              <Link href={href} passHref>
                <a>
                  <SquareButton icon="rightArrowLongSmall" />
                </a>
              </Link>
            )}
          </div>
        )}
      </div>
    </td>
  );
}

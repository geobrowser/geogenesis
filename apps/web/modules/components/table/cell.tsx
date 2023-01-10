import styled from '@emotion/styled';
import Link from 'next/link';
import React from 'react';
import { SquareButton } from '~/modules/design-system/button';

type StyledProps = Pick<Props, 'width'>;

const StyledTableCell = styled.td<StyledProps>(props => ({
  verticalAlign: 'top',
  backgroundColor: 'transparent', // To allow the row to be styled on hover
  border: `1px solid ${props.theme.colors['grey-02']}`,
  maxWidth: `${props.width}px`,
  padding: props.theme.space * 2.5,
}));

const Relative = styled.div({
  position: 'relative',
});

const Absolute = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  gap: props.theme.space,
  top: 0,
  right: 0,
  position: 'absolute',
  zIndex: 10,
}));

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
    <StyledTableCell onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} width={width}>
      <Relative>
        {children}
        {isHovered && (
          <Absolute>
            {isExpandable && (
              <SquareButton
                onClick={() => toggleExpanded()}
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
          </Absolute>
        )}
      </Relative>
    </StyledTableCell>
  );
}

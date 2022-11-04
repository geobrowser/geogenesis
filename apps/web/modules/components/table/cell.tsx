import styled from '@emotion/styled';
import React from 'react';
import { SmallButton } from '~/modules/design-system/button';

type StyledProps = Pick<Props, 'width' | 'isEditable'>;

const StyledTableCell = styled.td<StyledProps>(props => ({
  verticalAlign: 'top',
  backgroundColor: 'transparent', // To allow the row to be styled on hover
  border: `1px solid ${props.theme.colors['grey-02']}`,
  maxWidth: `${props.width}px`,
  padding: props.isEditable ? '0' : props.theme.space * 2.5,
}));

const Relative = styled.div({
  position: 'relative',
});

const Absolute = styled.div({
  top: 0,
  right: 0,
  position: 'absolute',
  zIndex: 10,
});

interface Props {
  children: React.ReactNode;
  width: number;
  isExpandable?: boolean;
  isExpanded: boolean;
  isEditable: boolean;
  toggleExpanded: () => void;
}

export function TableCell({ children, width, isExpandable, toggleExpanded, isExpanded, isEditable }: Props) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <StyledTableCell
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      width={width}
      isEditable={isEditable}
    >
      <Relative>
        {children}
        {isHovered && isExpandable && !isEditable && (
          <Absolute>
            <SmallButton
              onClick={() => toggleExpanded()}
              icon={isExpanded ? 'contractSmall' : 'expandSmall'}
              variant="secondary"
            />
          </Absolute>
        )}
      </Relative>
    </StyledTableCell>
  );
}

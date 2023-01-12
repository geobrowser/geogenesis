import styled from '@emotion/styled';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCloseSmall } from '~/modules/design-system/icons/check-close-small';

const StyledChip = styled.a(props => ({
  ...props.theme.typography.metadataMedium,
  borderRadius: props.theme.radius,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors.text}`,
  padding: `${props.theme.space}px ${props.theme.space * 2}px`,
  display: 'inline-block',
  backgroundColor: props.theme.colors.white,
  textDecoration: 'none',

  // We want to avoid large amounts of text in a chip being centered.
  textAlign: 'left',

  '&:hover, &:focus': {
    cursor: 'pointer',
    color: props.theme.colors.ctaPrimary,
    backgroundColor: props.theme.colors.ctaTertiary,
    boxShadow: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
  },
}));

{
  /* Wrapper to prevent the icon from being scaled by flexbox */
}
const StyledCheckCloseContainer = styled.button({
  all: 'unset',
  cursor: 'pointer',
});

const StyledDeletableChip = styled.a<{ isWarning: boolean }>(props => {
  const chipHoverActiveStyles = props.isWarning
    ? {}
    : {
        cursor: 'pointer',
        color: props.theme.colors.ctaPrimary,
        backgroundColor: props.theme.colors.ctaTertiary,
        boxShadow: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
      };

  const closeButtonActiveStyles = props.isWarning ? {} : { opacity: 0.3 };

  return {
    ...props.theme.typography.metadataMedium,
    borderRadius: props.theme.radius,
    padding: `${props.theme.space}px ${props.theme.space * 2}px`,
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: props.theme.space,
    // We want to avoid large amounts of text in a chip being centered.
    textAlign: 'left',

    backgroundColor: props.isWarning ? props.theme.colors['red-02'] : props.theme.colors.white,
    color: props.isWarning ? props.theme.colors['red-01'] : props.theme.colors.text,
    boxShadow: `inset 0 0 0 1px ${props.isWarning ? props.theme.colors['red-01'] : props.theme.colors.text}`,

    '&:hover, &:focus': chipHoverActiveStyles,
    [`&:hover ${StyledCheckCloseContainer}, &:focus ${StyledCheckCloseContainer}`]: closeButtonActiveStyles,
  };
});

interface Props {
  href: string;
  children: React.ReactNode;
}

export function Chip({ href, children }: Props) {
  return (
    <Link href={href} passHref>
      <StyledChip>{children}</StyledChip>
    </Link>
  );
}

const StyledLink = styled.a({
  color: 'currentcolor',
});

interface ChipButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  href: string;
}

export function DeletableChipButton({ onClick, children, href }: ChipButtonProps) {
  const [isWarning, setIsWarning] = useState(false);
  return (
    <StyledDeletableChip as="button" role="button" isWarning={isWarning}>
      <Link href={href} passHref>
        <StyledLink>{children}</StyledLink>
      </Link>
      <StyledCheckCloseContainer
        onClick={onClick}
        onMouseOver={() => setIsWarning(true)}
        onMouseOut={() => setIsWarning(false)}
      >
        <CheckCloseSmall />
      </StyledCheckCloseContainer>
    </StyledDeletableChip>
  );
}

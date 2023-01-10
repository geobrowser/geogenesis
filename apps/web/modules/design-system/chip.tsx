import styled from '@emotion/styled';
import Link from 'next/link';
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

type Icon = 'check-close';

const StyledChipButton = styled(StyledChip)(props => ({
  display: 'flex',
  alignItems: 'center',

  // We want to avoid large amounts of text in a chip being centered.
  textAlign: 'left',
  gap: props.theme.space,
}));

const StyledLink = styled.a(({ theme }) => ({
  color: 'currentcolor',
  ':hover': {
    textDecoration: 'underline',
  },
}));

interface ChipButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  icon?: Icon;
  href: string;
}

export function ChipButton({ onClick, children, icon, href }: ChipButtonProps) {
  return (
    <StyledChipButton as="button" role="button">
      <Link href={href} passHref>
        <StyledLink>{children}</StyledLink>
      </Link>
      {icon === 'check-close' ? (
        // Wrapper div to prevent the icon from being scaled by flexbox
        <div onClick={onClick}>
          <CheckCloseSmall />
        </div>
      ) : null}
    </StyledChipButton>
  );
}

import styled from '@emotion/styled';
import { ColorName } from './theme/colors';
import { TypographyName } from './theme/typography';

interface Props {
  children: React.ReactNode;
  color?: ColorName;
  variant?: TypographyName;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
}

const BaseText = styled.p<Required<Props>>(props => ({
  ...props.theme.typography[props.variant],
  color: props.theme.colors[props.color],
}));

export function Text({ children, color = 'text', variant = 'body', as = 'p' }: Props) {
  return (
    <BaseText as={as} color={color} variant={variant}>
      {children}
    </BaseText>
  );
}

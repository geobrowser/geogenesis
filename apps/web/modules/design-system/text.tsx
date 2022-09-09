import styled from '@emotion/styled';
import { Color, colors } from './theme/colors';
import { Typography, typography } from './theme/typography';

interface Props {
  children: React.ReactNode;
  color?: Color;
  variant?: Typography;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
}

const BaseText = styled.p<Required<Props>>(props => ({
  ...typography[props.variant],
  color: colors[props.color],
}));

export function Text({ children, color = 'text', variant = 'body', as = 'p' }: Props) {
  return (
    <BaseText as={as} color={color} variant={variant}>
      {children}
    </BaseText>
  );
}

import styled from '@emotion/styled';
import { ColorName } from './theme/colors';
import { TypographyName } from './theme/typography';

interface Props {
  children: React.ReactNode;
  color?: ColorName;
  variant?: TypographyName;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  ellipsize?: boolean;
  flex?: string;
}

const BaseText = styled.p<Required<Props>>(props => ({
  ...props.theme.typography[props.variant],
  color: props.theme.colors[props.color],
  ...(props.flex && { flex: props.flex }),
  ...(props.ellipsize && {
    whiteSpace: 'pre',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  }),
}));

export function Text({ children, color = 'text', variant = 'body', as = 'p', ellipsize = false, flex = '' }: Props) {
  return (
    <BaseText as={as} color={color} variant={variant} ellipsize={ellipsize} flex={flex}>
      {children}
    </BaseText>
  );
}

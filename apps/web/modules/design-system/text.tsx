import styled from '@emotion/styled';
import { forwardRef } from 'react';
import { ColorName } from './theme/colors';
import { TypographyName } from './theme/typography';

interface Props {
  children: React.ReactNode;
  color?: ColorName;
  variant?: TypographyName;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div' | 'a' | 'li';
  ellipsize?: boolean;
}

const BaseText = styled.span<Required<Omit<Props, 'href'>>>(props => ({
  ...props.theme.typography[props.variant],
  color: props.theme.colors[props.color],
  ...(props.ellipsize && {
    whiteSpace: 'pre',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  }),
}));

export const Text = forwardRef(function Text(
  { children, color = 'text', variant = 'body', as = 'span', ellipsize = false, ...rest }: Props,
  forwardedRef: React.Ref<HTMLSpanElement>
) {
  return (
    <BaseText ref={forwardedRef} as={as} color={color} variant={variant} ellipsize={ellipsize} {...rest}>
      {children}
    </BaseText>
  );
});

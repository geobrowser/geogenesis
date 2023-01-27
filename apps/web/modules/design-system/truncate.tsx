import styled from '@emotion/styled';
import { TypographyName } from './theme/typography';

interface Props {
  shouldTruncate?: boolean;
  maxLines?: number;
  variantLineHeight?: TypographyName;
}

export const Truncate = styled.div<Props>(props => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',

  ...(props.variantLineHeight && {
    lineHeight: props.theme.typography[props.variantLineHeight].lineHeight,
  }),

  ...(props.shouldTruncate && {
    overflow: 'hidden',
    WebkitLineClamp: String(props.maxLines ?? 1),
  }),
}));

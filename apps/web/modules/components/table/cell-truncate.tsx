import styled from '@emotion/styled';

export const CellTruncate = styled.div(props => ({
  margin: props.theme.space * 2.5,
  display: '-webkit-box',
  WebkitLineClamp: '3',
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}));

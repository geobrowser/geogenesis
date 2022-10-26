import styled from '@emotion/styled';

interface Props {
  shouldTruncate: boolean;
}

export const CellTruncate = styled.div<Props>(props => {
  // if (props.shouldTruncate) console.log('shouldTruncate', props.shouldTruncate);

  return {
    margin: props.theme.space * 2.5,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',

    ...(props.shouldTruncate && {
      overflow: 'hidden',
      WebkitLineClamp: '3',
    }),
  };
});

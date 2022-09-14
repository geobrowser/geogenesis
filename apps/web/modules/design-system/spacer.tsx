import styled from '@emotion/styled';

const Box = styled.div<Props>(props => ({
  height: props.height,
  width: props.width,
}));

interface Props {
  height?: number;
  width?: number;
}

export function Spacer({ height = 0, width = 0 }: Props) {
  return <Box height={height} width={width} />;
}

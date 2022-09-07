import styled from '@emotion/styled';

const Box = styled.div<{ height: number; width: number }>(props => ({
  margin: `${props.height}px ${props.width}px`,
}));

interface Props {
  height?: number;
  width?: number;
}

export function Spacer({ height = 0, width = 0 }: Props) {
  return <Box height={height} width={width} />;
}

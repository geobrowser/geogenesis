import styled from '@emotion/styled';
import { colors, ColorValue } from '~/modules/design-system/colors';
import { Spacer } from '~/modules/design-system/spacer';
import { typography } from '~/modules/design-system/typography';

const Swatch = styled.div<{ color: ColorValue }>(props => ({
  width: 125,
  height: 125,
  borderRadius: 4,
  backgroundColor: `${props.color}`,
}));

const Colors = Object.entries(colors).map(([name, color]) => {
  return (
    <div key={name}>
      <Swatch color={color} />
      <Spacer height={8} />
      <h2>{name}</h2>
      <Spacer height={4} />
      <p>{color}</p>
    </div>
  );
});

const Box = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 50px;
`;

const Heading = styled.h1({
  ...typography.mediumTitle,
});

export default function Dev() {
  return (
    <Box>
      <Heading>Colors</Heading>
      <Spacer height={20} />
      <Box>{Colors}</Box>
    </Box>
  );
}

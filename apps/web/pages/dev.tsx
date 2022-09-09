import styled from '@emotion/styled';
import { colors, ColorValue } from '~/modules/design-system/theme/colors';
import { Spacer } from '~/modules/design-system/spacer';
import { Typography, typography } from '~/modules/design-system/theme/typography';
import { Text } from '~/modules/design-system/text';

const Swatch = styled.div<{ color: ColorValue }>(props => ({
  width: 150,
  height: 150,
  borderRadius: 4,
  backgroundColor: `${props.color}`,
}));

const Colors = Object.entries(colors).map(([name, color]) => {
  return (
    <div key={name}>
      <Swatch color={color} />
      <Spacer height={8} />
      <Text variant="bodyBold">{name}</Text>
      <Text>{color}</Text>
    </div>
  );
});

const Typography = Object.keys(typography).map((name, index) => {
  return (
    <Text key={index} variant={name as Typography}>
      {name}
    </Text>
  );
});

const HorizontalBox = styled.div({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '25px',
});

const VerticalBox = styled.div({
  display: 'flex',
  flexDirection: 'column',
  flexWrap: 'wrap',
  gap: '12px',
});

export default function Dev() {
  return (
    <VerticalBox>
      <HorizontalBox>
        <Text variant="mediumTitle">Colors</Text>
        <Spacer height={12} />
        <HorizontalBox>{Colors}</HorizontalBox>

        <Spacer height={32} />
      </HorizontalBox>
      <VerticalBox>
        <Text variant="mediumTitle">Typography</Text>
        <VerticalBox>{Typography}</VerticalBox>
      </VerticalBox>
    </VerticalBox>
  );
}

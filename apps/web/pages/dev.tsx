import styled from '@emotion/styled';
import { colors, ColorValue } from '~/modules/design-system/colors';
import { Spacer } from '~/modules/design-system/spacer';
import { Typeography, typography, TypographyValue } from '~/modules/design-system/typography';

const Swatch = styled.div<{ color: ColorValue }>(props => ({
  width: 150,
  height: 150,
  borderRadius: 4,
  backgroundColor: `${props.color}`,
}));

const ColorTitle = styled.h2({
  ...typography.bodyBold,
});

const ColorValueSpan = styled.p({
  ...typography.body,
});

const Colors = Object.entries(colors).map(([name, color]) => {
  return (
    <div key={name}>
      <Swatch color={color} />
      <Spacer height={8} />
      <ColorTitle>{name}</ColorTitle>
      <ColorValueSpan>{color}</ColorValueSpan>
    </div>
  );
});

const TypeSwatch = styled.p<{ styles: TypographyValue }>(props => ({
  ...props.styles,
}));

const Typography = Object.entries(typography).map(([name, value], index) => {
  console.log(value);
  return (
    <TypeSwatch key={index} styles={value}>
      {name}
    </TypeSwatch>
  );
});

const HorizontalBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 25px;
`;

const VerticalBox = styled.div`
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  gap: 12px;
`;

const Heading = styled.h1({
  ...typography.mediumTitle,
});

export default function Dev() {
  return (
    <VerticalBox>
      <HorizontalBox>
        <Heading>Colors</Heading>
        <Spacer height={12} />
        <HorizontalBox>{Colors}</HorizontalBox>

        <Spacer height={32} />
      </HorizontalBox>
      <VerticalBox>
        <Heading>Typography</Heading>
        <VerticalBox>{Typography}</VerticalBox>
      </VerticalBox>
    </VerticalBox>
  );
}

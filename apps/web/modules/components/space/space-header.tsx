import styled from '@emotion/styled';
import Image from 'next/image';
import { Text } from '~/modules/design-system/text';
import { ZERO_WIDTH_SPACE } from '../../constants';

const SpaceImageContainer = styled.div(props => ({
  // this is required for next/image
  // https://nextjs.org/docs/api-reference/next/image#fill
  position: 'relative',
  overflow: 'hidden',
  borderRadius: props.theme.radius * 2,
  width: props.theme.space * 14,
  height: props.theme.space * 14,
}));

const SpaceInfo = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 5,
}));

const SpaceHeaderContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
}

export function SpaceHeader({ spaceImage, spaceName = ZERO_WIDTH_SPACE }: Props) {
  return (
    <SpaceHeaderContainer>
      <SpaceInfo>
        <SpaceImageContainer>
          <Image
            objectFit="cover"
            layout="fill"
            src={spaceImage ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF'}
            alt={`Cover image for ${spaceName}`}
          />
        </SpaceImageContainer>

        <Text flex="0 0 auto" variant="mainPage" as="h1">
          {spaceName}
        </Text>
      </SpaceInfo>
    </SpaceHeaderContainer>
  );
}

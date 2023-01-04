import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import Image from 'next/image';
import { Text } from '~/modules/design-system/text';
// import { importCSVFile } from '~/modules/services/import';
import { ZERO_WIDTH_SPACE } from '../../constants';
// import { getFilesFromFileList } from '../utils';

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

// const FileImport = styled.input({
//   margin: '0',
//   padding: '0',
//   opacity: '0',
//   position: 'absolute',
//   inset: '0',
// });

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
}

export function SpaceHeader({ spaceImage, spaceName = ZERO_WIDTH_SPACE }: Props) {
  const theme = useTheme();

  return (
    <SpaceHeaderContainer>
      <SpaceInfo>
        <SpaceImageContainer>
          <Image
            objectFit="cover"
            layout="fill"
            width={theme.space * 14}
            height={theme.space * 14}
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

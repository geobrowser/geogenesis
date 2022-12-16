import { useTheme } from '@emotion/react';
import Image from 'next/image';
import { Text } from '~/modules/design-system/text';
// import { importCSVFile } from '~/modules/services/import';
import { ZERO_WIDTH_SPACE } from '../../constants';
// import { getFilesFromFileList } from '../utils';
import { SpaceHeaderContainer, SpaceImageContainer, SpaceInfo } from '../table/styles';

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

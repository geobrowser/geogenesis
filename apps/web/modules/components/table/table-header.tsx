import { useTheme } from '@emotion/react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
// import { importCSVFile } from '~/modules/services/import';
import { useAccessControl } from '~/modules/state/use-access-control';
import { ZERO_WIDTH_SPACE } from '../../constants';
import { useEditable } from '../../state/use-editable';
import { NavUtils } from '../../utils';
// import { getFilesFromFileList } from '../utils';
import { Actions, SpaceImageContainer, SpaceInfo, TableHeaderContainer } from '../table/styles';

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

export function TableHeader({ spaceId, spaceImage, spaceName = ZERO_WIDTH_SPACE }: Props) {
  const { isEditor, isAdmin } = useAccessControl(spaceId);
  const { editable } = useEditable();
  const theme = useTheme();

  return (
    <TableHeaderContainer>
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

      <Actions>
        {(isEditor || isAdmin) && editable && (
          <TableHeaderContainer>
            {isAdmin && (
              <Link href={`/space/${spaceId}/access-control`}>
                <Button variant="secondary">Devvy Admin</Button>
              </Link>
            )}
            {isAdmin && isEditor && <Spacer width={8} />}
            {isEditor && (
              <>
                {/* <Button variant="secondary" icon="create">
                    Import
                    <FileImport
                      type="file"
                      accept=".csv"
                      multiple={true}
                      onChange={event => {
                        onImport(event.target.files ?? new FileList());
                      }}
                    />
                  </Button> */}
                <Spacer width={12} />
                <Link href={NavUtils.toCreateEntity(spaceId)} passHref>
                  <a>
                    <Button icon="create">New entity</Button>
                  </a>
                </Link>
              </>
            )}
          </TableHeaderContainer>
        )}
      </Actions>
    </TableHeaderContainer>
  );
}

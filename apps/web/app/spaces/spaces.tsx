'use client';

import styled from '@emotion/styled';
import { ethers } from 'ethers';
import Link from 'next/link';
import { SYSTEM_IDS } from '~/modules/constants';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useSpaces } from '~/modules/state/use-spaces';

const Grid = styled.div(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: `${theme.space * 5}px`,
}));

const GridCell = styled.div({
  cursor: 'pointer',
});

const CoverImage = styled.img(({ theme }) => ({
  width: '100%',
  aspectRatio: '1.4',
  objectFit: 'cover',
  borderRadius: theme.radius,
}));

export function Spaces() {
  const { spaces } = useSpaces();
  const rootSpaceId = spaces.find(space => space.isRootSpace)?.id ?? ethers.constants.AddressZero;
  const { isEditor, isAdmin } = useAccessControl(rootSpaceId);

  return (
    <Grid>
      {spaces
        .filter(space => isAdmin || isEditor || !space.isRootSpace)
        .map(space => {
          const name = space.attributes.name ?? '';
          const image =
            space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF';

          return (
            <Link key={space.id} href={`/space/${space.id}`}>
              <GridCell>
                {image && <CoverImage src={image} alt="" />}
                <Spacer height={12} />
                <Text variant="smallTitle">{name}</Text>
              </GridCell>
            </Link>
          );
        })}
    </Grid>
  );
}

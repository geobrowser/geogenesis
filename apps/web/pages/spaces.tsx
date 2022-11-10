import styled from '@emotion/styled';
import { ethers } from 'ethers';
import Link from 'next/link';
import { SYSTEM_IDS } from '~/modules/constants';
import { Card } from '~/modules/design-system/card';

import { useAccessControl } from '~/modules/state/use-access-control';
import { useSpaces } from '~/modules/state/use-spaces';

const Grid = styled.div(({ theme }) => ({
  display: 'flex',
  gap: `${theme.space * 5}px`,
}));

export default function Spaces() {
  const { spaces } = useSpaces();
  const rootSpaceId = spaces.find(space => space.isRootSpace)?.id ?? ethers.constants.AddressZero;
  const { isEditor, isAdmin } = useAccessControl(rootSpaceId);

  return (
    <Grid>
      {spaces
        .filter(space => isAdmin || isEditor || !space.isRootSpace)
        .map(space => {
          const name = space.attributes.name;
          const image = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE];

          return <Card key={space.id} spaceId={space.id} name={name} image={image} />;
        })}
    </Grid>
  );
}

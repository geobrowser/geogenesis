import styled from '@emotion/styled';
import { ethers } from 'ethers';
import { SYSTEM_IDS } from '~/modules/constants';
import { Card } from '~/modules/design-system/card';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

import { useAccessControl } from '~/modules/state/use-access-control';
import { useSpaces } from '~/modules/state/use-spaces';

const Grid = styled.div(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, 340px)',
  gap: `${theme.space * 5}px`,
}));

const TextContainer = styled.div({
  maxWidth: 830,
});

export default function Spaces() {
  const { spaces } = useSpaces();
  const rootSpaceId = spaces.find(space => space.isRootSpace)?.id ?? ethers.constants.AddressZero;
  const { isEditor, isAdmin } = useAccessControl(rootSpaceId);

  return (
    <div>
      <Text variant="mainPage">All spaces</Text>

      <Spacer height={40} />

      <Grid>
        {spaces
          .filter(space => isAdmin || isEditor || !space.isRootSpace)
          .map(space => {
            const name = space.attributes.name;
            const image = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE];

            return <Card key={space.id} spaceId={space.id} name={name} image={image} />;
          })}
      </Grid>

      <Spacer height={100} />

      <TextContainer>
        <Text variant="largeTitle">
          Together we can change how society is organized, put power into the hands of those who’ve earned it, and
          distribute resources and opportunity far and wide.
        </Text>
      </TextContainer>
    </div>
  );
}

import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Text } from '~/modules/design-system/text';
import { NavUtils } from '../utils';
import { RightArrowDiagonal } from './icons/right-arrow-diagonal';

const CoverImageContainer = styled.div({
  // this is required for next/image
  // https://nextjs.org/docs/api-reference/next/image#fill
  position: 'relative',
  overflow: 'hidden',

  width: 590,
  height: 240,
  objectFit: 'cover',
  transition: 'all ease-in-out 0.15s',

  '@media (max-width: 1200px)': {
    width: '92vw',
    maxHeight: 240,
  },
});

const CoverImage = styled(Image)({
  transition: 'all ease-in-out 0.15s',
});

const fade = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const GridCell = styled.a(({ theme }) => ({
  cursor: 'pointer',
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',
  boxShadow: theme.shadows.button,
  transition: 'box-shadow ease-in-out 0.15s',
  animation: `${fade} 0.15s ease-in-out`,

  '&:hover': {
    boxShadow: theme.shadows.card,
  },

  '&:hover img': {
    transform: 'scale(1.05)',
  },
}));

const Header = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.space * 4,
  backgroundColor: theme.colors.white,
}));

interface Props {
  spaceId: string;
  name?: string;
  image?: string;
}

export function Card({ spaceId, name = spaceId, image = 'https://via.placeholder.com/600x600/FF00FF/FFFFFF' }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={NavUtils.toSpace(spaceId)} passHref>
      <GridCell onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <Header>
          <Text variant="smallTitle">{name}</Text>
          <RightArrowDiagonal color={hovered ? 'text' : 'grey-04'} />
        </Header>

        {image && (
          <CoverImageContainer>
            {/* <CoverImage objectFit="cover" priority layout="fill" src={image} alt={`Cover image for ${name}`} /> */}
          </CoverImageContainer>
        )}
      </GridCell>
    </Link>
  );
}

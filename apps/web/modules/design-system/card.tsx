import styled from '@emotion/styled';
import Link from 'next/link';
import { useState } from 'react';
import { Text } from '~/modules/design-system/text';
import { RightArrowDiagonal } from './icons/right-arrow-diagonal';

const CoverImageContainer = styled.div({
  overflow: 'hidden',
});

const CoverImage = styled.img({
  width: 340,
  height: 240,
  objectFit: 'cover',
  transition: 'all ease-in-out 0.15s',
});

const GridCell = styled.a(({ theme }) => ({
  cursor: 'pointer',
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',
  boxShadow: theme.shadows.button,
  transition: 'all ease-in-out 0.15s',

  '&:hover': {
    boxShadow: `0 8px 25px rgba(0, 0, 0, 0.09)`,

    // @ts-ignore -- This is valid in CSS-in-JS
    [CoverImage]: {
      transform: 'scale(1.1)',
    },
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
    <Link href={`/space/${spaceId}`} passHref>
      <GridCell onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <Header>
          <Text variant="smallTitle">{name}</Text>
          <RightArrowDiagonal color={hovered ? 'text' : 'grey-04'} />
        </Header>

        {image && (
          <CoverImageContainer>
            <CoverImage src={image} alt={`Cover image for ${name}`} />
          </CoverImageContainer>
        )}
      </GridCell>
    </Link>
  );
}

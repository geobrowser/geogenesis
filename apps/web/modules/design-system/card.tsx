import styled from '@emotion/styled';
import Link from 'next/link';
import { Text } from '~/modules/design-system/text';
import { RightArrowDiagonal } from './icons/right-arrow-diagonal';

const GridCell = styled.a(({ theme }) => ({
  cursor: 'pointer',
  borderRadius: theme.radius,
  border: `1px solid ${theme.colors['grey-02']}`,
  overflow: 'hidden',
  boxShadow: theme.shadows.button,
}));

const CoverImage = styled.img(({ theme }) => ({
  width: 340,
  height: 240,
  objectFit: 'cover',
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
  return (
    <Link href={`/space/${spaceId}`} passHref>
      <GridCell>
        <Header>
          <Text variant="smallTitle">{name}</Text>
          <RightArrowDiagonal color="text" />
        </Header>
        {image && <CoverImage src={image} alt={`Cover image for ${name}`} />}
      </GridCell>
    </Link>
  );
}

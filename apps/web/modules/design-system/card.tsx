import styled from '@emotion/styled';
import Link from 'next/link';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { RightArrowDiagonal } from './icons/right-arrow-diagonal';

const GridCell = styled.div({
  cursor: 'pointer',
});

const CoverImage = styled.img(({ theme }) => ({
  width: 340,
  height: 240,
  objectFit: 'cover',
  borderRadius: `0 0 ${theme.radius}px ${theme.radius}px`,
}));

const Header = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: props.theme.space * 4,
  backgroundColor: props.theme.colors.white,
}));

interface Props {
  spaceId: string;
  name?: string;
  image?: string;
}

export function Card({ spaceId, name = spaceId, image = 'https://via.placeholder.com/600x600/FF00FF/FFFFFF' }: Props) {
  return (
    <Link href={`/space/${spaceId}`}>
      <GridCell>
        <Header>
          <Text variant="smallTitle">{name}</Text>
          <RightArrowDiagonal color="text" />
        </Header>
        {image && <CoverImage src={image} alt={`Cover image for ${name}`} />}
        <Spacer height={12} />
      </GridCell>
    </Link>
  );
}

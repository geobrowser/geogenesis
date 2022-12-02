import styled from '@emotion/styled';
import Link from 'next/link';
import { Spacer } from './spacer';
import { Text } from './text';

const BreadcrumbLink = styled.a(props => ({
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  padding: '1px 0', // creates space above the image and text to make focus state look better
  whiteSpace: 'nowrap',

  span: {
    transition: 'color 0.15s ease-in-out',
  },

  '&:hover': {
    span: {
      color: props.theme.colors.text,
    },
  },
}));

const Image = styled.img(props => ({
  width: '16px',
  height: '16px',
  objectFit: 'cover',
  borderRadius: props.theme.radius / 1.5,
}));

const Truncate = styled.div<{ shouldTruncate?: boolean }>(props => ({
  ...(props.shouldTruncate && {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
}));

interface Props {
  href: string;
  children: string;
  isNested: boolean;
  img: string | null;
  shouldTruncate?: boolean;
}

export function Breadcrumb({ children, href, img, isNested, shouldTruncate }: Props) {
  return (
    <Link href={href} passHref>
      <BreadcrumbLink title={children}>
        {img && (
          <>
            <Image src={img} alt="" />
            <Spacer width={8} />
          </>
        )}
        <Truncate shouldTruncate={shouldTruncate}>
          <Text variant="metadataMedium" color={isNested ? 'grey-04' : 'text'}>
            {children}
          </Text>
        </Truncate>
      </BreadcrumbLink>
    </Link>
  );
}

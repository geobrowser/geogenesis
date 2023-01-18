import styled from '@emotion/styled';
import Image from 'next/image';
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

const BasicBreadcrumbContainer = styled.span(props => ({
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  padding: '1px 0', // creates space above the image and text to make focus state look better
  whiteSpace: 'nowrap',
}));

const ImageContainer = styled.div(props => ({
  // this is required for next/image
  // https://nextjs.org/docs/api-reference/next/image#fill
  position: 'relative',
  overflow: 'hidden',
  width: props.theme.space * 4,
  height: props.theme.space * 4,
  borderRadius: props.theme.radius / 1.5,
}));

const SmallImageContainer = styled.div(props => ({
  // this is required for next/image
  // https://nextjs.org/docs/api-reference/next/image#fill
  position: 'relative',
  overflow: 'hidden',
  width: props.theme.space * 3,
  height: props.theme.space * 3,
  borderRadius: props.theme.radius / 1.5,
}));

const Truncate = styled.div<{ shouldTruncate?: boolean }>(props => ({
  ...(props.shouldTruncate && {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
}));

interface LinkableBreadcrumbProps {
  href: string;
  children: string;
  isNested: boolean;
  img: string | null;
  shouldTruncate?: boolean;
}

export function LinkableBreadcrumb({ children, href, img, isNested, shouldTruncate }: LinkableBreadcrumbProps) {
  return (
    <Link href={href} passHref>
      <BreadcrumbLink title={children}>
        {img && (
          <>
            <ImageContainer>
              <Image priority layout="fill" objectFit="cover" src={img} alt="Image representing the current Space" />
            </ImageContainer>
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

interface BreadcrumbProps {
  children: string;
  img: string | null;
}

export function Breadcrumb({ children, img }: BreadcrumbProps) {
  return (
    <BasicBreadcrumbContainer>
      {img && (
        <>
          <SmallImageContainer>
            <Image priority layout="fill" objectFit="cover" src={img} alt="Image representing the current Space" />
          </SmallImageContainer>
          <Spacer width={4} />
        </>
      )}
      <Text variant="tag" color={'text'}>
        {children}
      </Text>
    </BasicBreadcrumbContainer>
  );
}

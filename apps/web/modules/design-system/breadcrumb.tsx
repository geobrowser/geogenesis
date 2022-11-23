import styled from '@emotion/styled';
import Link from 'next/link';
import React from 'react';
import { Spacer } from './spacer';
import { Text } from './text';

const BreadcrumbLink = styled.a(props => ({
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  padding: '1px 0', // creates space above the image and text to make focus state look better
}));

const Image = styled.img(props => ({
  width: '16px',
  height: '16px',
  objectFit: 'cover',
  borderRadius: props.theme.radius / 1.5,
}));

interface Props {
  href: string;
  children: React.ReactNode;
  isNested: boolean;
  img: string | null;
}

export function Breadcrumb({ children, href, img, isNested }: Props) {
  return (
    <Link href={href} passHref>
      <BreadcrumbLink>
        {img && (
          <>
            <Image src={img} alt="" />
            <Spacer width={8} />
          </>
        )}
        <Text variant="metadataMedium" color={isNested ? 'grey-04' : 'text'}>
          {children}
        </Text>
      </BreadcrumbLink>
    </Link>
  );
}

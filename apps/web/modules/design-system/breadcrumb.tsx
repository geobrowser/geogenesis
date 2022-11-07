import styled from '@emotion/styled';
import Link from 'next/link';
import React from 'react';
import { Spacer } from './spacer';
import { Text } from './text';

const BreadcrumbLink = styled.a({
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
});

const Image = styled.img(props => ({
  width: '16px',
  height: '16px',
  objectFit: 'cover',
  borderRadius: props.theme.radius,
}));

interface Props {
  href: string;
  children: React.ReactNode;
  img: string;
}

export function Breadcrumb({ children, href, img }: Props) {
  return (
    <Link href={href}>
      <BreadcrumbLink>
        {img && (
          <>
            <Image src={img} alt="" />
            <Spacer width={8} />
          </>
        )}
        <Text variant="breadcrumb">{children}</Text>
      </BreadcrumbLink>
    </Link>
  );
}

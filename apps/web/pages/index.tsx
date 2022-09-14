import styled from '@emotion/styled';
import Link from 'next/link';

const Column = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export default function Home() {
  return (
    <Column>
      <Link href="/facts">
        <a>Facts database</a>
      </Link>
      <Link href="/databases/sync">
        <a>Sync database example</a>
      </Link>
    </Column>
  );
}

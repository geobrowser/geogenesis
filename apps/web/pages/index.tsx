import styled from '@emotion/styled';
import Link from 'next/link';
import { config } from '~/modules/config';

const Column = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export default function Home() {
  console.log(config);

  return (
    <Column>
      <Link href="/triples">
        <a>Facts database</a>
      </Link>
    </Column>
  );
}

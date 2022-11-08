'use client';

import { GetServerSideProps } from 'next';
import dynamic from 'next/dynamic';
import { useSelectedLayoutSegment } from 'next/navigation';

// We're dynamically importing the Triples so we can disable SSR. There are hydration mismatches since
// the server doesn't know what wallet is connected, and we may render differently based on chain and wallet
// address.
const Triples = dynamic(() => import('~/modules/components/triples'), {
  ssr: false,
});

export default function TriplesPage({ params }: { params: { spaceId: string } }) {
  return <Triples spaceId={params.spaceId} />;
}

// export const getServerSideProps: GetServerSideProps = async context => {
//   const spaceId = context.params?.id as string;

//   return {
//     props: {
//       spaceId,
//     },
//   };
// };

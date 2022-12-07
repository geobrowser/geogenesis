import { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { useSpaces } from '~/modules/state/use-spaces'

// We're dynamically importing the Triples so we can disable SSR. There are hydration mismatches since
// the server doesn't know what wallet is connected, and we may render differently based on chain and wallet
// address.
const Triples = dynamic(() => import('~/modules/components/triples'), {
	ssr: false,
})

export default function TriplesPage({ spaceId }: { spaceId: string }) {
	const { spaces } = useSpaces()
	const spaceNames = Object.fromEntries(spaces.map((space) => [space.id, space.attributes.name]))

	return (
		<div>
			<Head>
				<title>{spaceNames[spaceId] ?? spaceId}</title>
				<meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
			</Head>
			<Triples spaceId={spaceId} />
		</div>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	const spaceId = context.params?.id as string

	return {
		props: {
			spaceId,
		},
	}
}

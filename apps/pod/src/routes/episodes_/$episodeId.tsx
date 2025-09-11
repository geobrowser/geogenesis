import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute, Link} from "@tanstack/react-router"
import {Apple} from "@/components/icons/apple"
import {Spotify} from "@/components/icons/spotify"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {DetailsImage, DetailsSummary} from "@/components/layouts/details-header"
import {Button} from "@/components/ui/button"
import {PersonCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {getImagePath} from "@/lib/images"
import {Episode} from "@/schema"

export const Route = createFileRoute("/episodes_/$episodeId")({
	component: RouteComponent,
})

const listenOn: {id: string; name: string; icon?: React.ReactNode}[] = [
	{
		id: "apple-podcasts",
		name: "Apple Podcasts",
		icon: <Apple />,
	},
	{
		id: "spotify",
		name: "Spotify",
		icon: <Spotify />,
	},
]

function RouteComponent() {
	const {episodeId} = Route.useParams()

	const {data: episodes} = useQuery(Episode, {
		mode: "public",
		first: 1,
		include: {
			avatar: {},
			guests: {
				avatar: {},
			},
			hosts: {
				avatar: {},
			},
			podcast: {
				avatar: {},
			},
		},
	})

	const episode = episodes?.find((e) => e.id === episodeId)

	if (!episode) {
		return <div>Episode not found</div>
	}

	// Get quotes for this episode
	// const episodeQuotes = quotes
	// 	.filter((quote) => quote.episodeId === episodeId)
	// 	.map((quote) => ({
	// 		...quote,
	// 		person: people.find((person) => person.id === quote.personId),
	// 	}))
	// 	.filter((quote) => quote.person !== undefined)
	// 	.sort((a, b) => {
	// 		// Convert timestamps to minutes for comparison
	// 		const [aHours, aMinutes] = a.timestamp.split(":").map(Number)
	// 		const [bHours, bMinutes] = b.timestamp.split(":").map(Number)
	// 		const aTotalMinutes = aHours * 60 + aMinutes
	// 		const bTotalMinutes = bHours * 60 + bMinutes
	// 		return aTotalMinutes - bTotalMinutes
	// 	})

	const show = episode.podcast?.[0]
	const showAvatarUrl = show?.avatar?.[0]?.url ? getImagePath(show?.avatar?.[0]?.url) : null

	return (
		<div>
			<div className="w-full h-[324px] flex items-center justify-center relative bg-black overflow-hidden">
				<DetailsImage imageUrl={showAvatarUrl} />
			</div>
			<ConstrainedLayout>
				<div className="space-y-10">
					<DetailsSummary
						id={episode.id}
						type="episode"
						description={episode.description ?? ""}
						// episodeCount={show?.episodeCount ?? 1}
						episodeCount={0}
						// tagIds={episode.tagIds}
						tagIds={[]}
						title={episode.name}
					/>

					<Hr />
					<div className="space-y-4">
						<h2 className="text-medium-title">Listen here</h2>
						<div className="flex items-center gap-2">
							{listenOn.map((l) => (
								<Link key={l.id} to="/">
									<Button variant="outline">
										{l.icon}
										{l.name}
									</Button>
								</Link>
							))}
						</div>
					</div>

					{/* <Hr />

					<div className={episodeQuotes.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Notable Quotes</h2>
						{episodeQuotes.length > 0 ? (
							<div className="space-y-4">
								{episodeQuotes.map((quote) => (
									<QuoteCard
										key={quote.id}
										quote={quote.quote}
										personName={quote.person?.name}
										personImageUrl={quote.person?.avatarUrl}
										timestamp={quote.timestamp}
									/>
								))}
							</div>
						) : (
							<p className="text-secondary-light">No quotes available for this episode.</p>
						)}
					</div> */}

					<Hr />
					<div className={episode.hosts.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Hosts</h2>
						<Scrollable gap="gap-3">
							{episode.hosts.map((host) => (
								<PersonCard
									key={host.id}
									avatarUrl={host.avatar[0]?.url ? getImagePath(host.avatar[0]?.url) : null}
									name={host.name}
								/>
							))}
						</Scrollable>

						{episode.hosts.length === 0 && (
							<p className="text-secondary-light">No hosts information available.</p>
						)}
					</div>

					<Hr />

					<div className={episode.guests.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Guests</h2>
						<Scrollable gap="gap-3">
							{episode.guests.map((guest) => (
								<PersonCard
									key={guest.id}
									avatarUrl={guest.avatar[0]?.url ? getImagePath(guest.avatar[0]?.url) : null}
									name={guest.name}
								/>
							))}
						</Scrollable>
						{episode.guests.length === 0 && (
							<p className="text-secondary-light">No guests featured in this episode.</p>
						)}
					</div>
				</div>
			</ConstrainedLayout>
		</div>
	)
}

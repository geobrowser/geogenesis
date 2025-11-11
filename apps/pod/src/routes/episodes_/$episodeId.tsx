import {createFileRoute, Link} from "@tanstack/react-router"
import {Apple} from "@/components/icons/apple"
import {Spotify} from "@/components/icons/spotify"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {DetailsImage, DetailsSummary} from "@/components/layouts/details-header"
import {Button} from "@/components/ui/button"
import {PersonCard, QuoteCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {episodes} from "@/data/episodes"
import {people} from "@/data/people"
import {quotes} from "@/data/quotes"
import {podcasts} from "@/data/shows"

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

	const episode = episodes.find((ep) => ep.id === episodeId)

	if (!episode) {
		return <div>Episode not found</div>
	}

	// Get the show for this episode
	const show = podcasts.find((podcast) => podcast.id === episode.showId)

	// Get guests for this episode
	const episodeGuests =
		episode.guestIds
			.map((guestId) => people.find((person) => person.id === guestId))
			.filter((g) => g !== undefined) || []

	// Get hosts for this show
	const showHosts =
		show?.hostIds.map((hostId) => people.find((person) => person.id === hostId)).filter((h) => h !== undefined) ||
		[]

	// Get quotes for this episode
	const episodeQuotes = quotes
		.filter((quote) => quote.episodeId === episodeId)
		.map((quote) => ({
			...quote,
			person: people.find((person) => person.id === quote.personId),
		}))
		.filter((quote) => quote.person !== undefined)
		.sort((a, b) => {
			// Convert timestamps to minutes for comparison
			const [aHours, aMinutes] = a.timestamp.split(":").map(Number)
			const [bHours, bMinutes] = b.timestamp.split(":").map(Number)
			const aTotalMinutes = aHours * 60 + aMinutes
			const bTotalMinutes = bHours * 60 + bMinutes
			return aTotalMinutes - bTotalMinutes
		})

	return (
		<div>
			<div className="w-full h-[324px] flex items-center justify-center relative bg-black overflow-hidden">
				<DetailsImage imageUrl={show?.imageUrl || ""} />
			</div>
			<ConstrainedLayout>
				<div className="space-y-10">
					<DetailsSummary
						id={episode.id}
						type="episode"
						description={episode.description}
						episodeCount={show?.episodeCount ?? 1}
						tagIds={episode.tagIds}
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

					<Hr />

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
					</div>

					<Hr />
					<div className={showHosts.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Hosts</h2>
						<Scrollable gap="gap-3">
							{showHosts.map((host) => (
								<PersonCard key={host.id} avatarUrl={host.avatarUrl} name={host.name} />
							))}
						</Scrollable>

						{showHosts.length === 0 && (
							<p className="text-secondary-light">No hosts information available.</p>
						)}
					</div>

					<Hr />

					<div className={episodeGuests.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Guests</h2>
						<Scrollable gap="gap-3">
							{episodeGuests.map((guest) => (
								<PersonCard key={guest.id} avatarUrl={guest.avatarUrl} name={guest.name} />
							))}
						</Scrollable>
						{episodeGuests.length === 0 && (
							<p className="text-secondary-light">No guests featured in this episode.</p>
						)}
					</div>
				</div>
			</ConstrainedLayout>
		</div>
	)
}

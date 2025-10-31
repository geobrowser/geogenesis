import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute, Link} from "@tanstack/react-router"
import React from "react"
import {Apple} from "@/components/icons/apple"
import {Spotify} from "@/components/icons/spotify"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {DetailsImage, DetailsSummary} from "@/components/layouts/details-header"
import {Button} from "@/components/ui/button"
import {EpisodeCard, PersonCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {getImagePath} from "@/lib/images"
import {resolveShowSlug} from "@/lib/slug-mapping"
import {Episode, Podcast} from "@/schema"
import {PODCAST_SPACE_ID} from "@/config"

export const Route = createFileRoute("/shows_/$showId")({
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
	const {showId} = Route.useParams()

	// @TODO: SDK doesn't currently support filtering by entity ID in public queries
	// Fetching all shows and filtering client-side for now
	const queryResult = useQuery(Podcast, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
			hosts: {
				avatar: {},
			},
		},
	})

	const allShows = queryResult.data ?? []

	// Resolve slug to entity ID (e.g., "the-joe-rogan-experience" -> UUID)
	// Falls back to showId if no mapping exists (supports direct UUID URLs)
	const entityId = resolveShowSlug(showId, allShows) ?? showId

	const show = allShows.find((s) => s.id === entityId)

	const {data: allEpisodes} = useQuery(Episode, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
			podcast: {},
		},
	})

	if (!show) {
		return <div>Show not found</div>
	}

	// Filter episodes to only those belonging to this show
	const episodes = (allEpisodes ?? []).filter((episode) => episode.podcast?.[0]?.id === show.id)

	const showAvatarUrl = show.avatar?.[0]?.url ? getImagePath(show.avatar?.[0]?.url) : null

	return (
		<div>
			<div className="w-full h-[324px] flex items-center justify-center relative bg-black overflow-hidden">
				<DetailsImage imageUrl={showAvatarUrl} />
			</div>
			<ConstrainedLayout>
				<div className="space-y-10">
					<DetailsSummary
						id={show.id}
						type="show"
						description={show.description ?? ""}
						episodeCount={episodes?.length ?? 0}
						dateFounded={show.dateFounded}
						tagIds={[]}
						title={show.name}
					/>

					<Hr />

					<div className={episodes.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Episodes</h2>
						<Scrollable>
							{episodes.map((episode) => (
								<EpisodeCard
									key={episode.id}
									author={show.name}
									duration={episode.duration}
									id={episode.id}
									name={episode.name}
									publishDate={episode.airDate.toISOString()}
									description={episode.description}
									coverImg={episode.avatar?.[0]?.url ? getImagePath(episode.avatar?.[0]?.url) : null}
								/>
							))}
						</Scrollable>
						{episodes.length === 0 && <p className="text-secondary-light">No episodes available yet.</p>}
					</div>
					<Hr />
					<div className={show.hosts.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Hosts</h2>
						<Scrollable>
							{show.hosts.map((host) => (
								<PersonCard
									key={host.id}
									avatarUrl={host.avatar?.[0]?.url ? getImagePath(host.avatar[0].url) : null}
									name={host.name}
								/>
							))}
						</Scrollable>
						{show.hosts.length === 0 && (
							<p className="text-secondary-light">No hosts information available.</p>
						)}
					</div>
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
				</div>
			</ConstrainedLayout>
		</div>
	)
}

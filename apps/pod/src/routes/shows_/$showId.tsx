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
import {Episode, Podcast} from "@/schema"

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
	// @TODO need to be able to query public spaces by entity id
	const {showId} = Route.useParams()

	const {data: shows} = useQuery(Podcast, {
		mode: "public",
		first: 1,
		space: "35d77493-4b40-4bfb-b43d-98a796e7a233",
		filter: {
			name: {
				startsWith: "The Joe Rogan Experience",
			},
		},
		include: {
			avatar: {},
			hosts: {
				avatar: {},
			},
		},
	})

	const show = shows?.[0]

	const {data: episodes} = useQuery(Episode, {
		mode: "public",
		space: "35d77493-4b40-4bfb-b43d-98a796e7a233",
		include: {
			avatar: {},
		},
	})

	if (!show) {
		return <div>Show not found</div>
	}

	console.log("episodes", episodes)

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
						// tagIds={show.tagIds}
						tagIds={[]}
						title={show.name}
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

					<div className={episodes.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Episodes</h2>
						<Scrollable gap="gap-3">
							{episodes.map((episode) => (
								<EpisodeCard
									key={episode.id}
									author={show.name}
									duration={episode.duration}
									id={episode.id}
									name={episode.name}
									publishDate={new Date().toISOString()}
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
						<Scrollable gap="gap-3">
							{show.hosts.map((host) => (
								<PersonCard
									key={host.id}
									avatarUrl={host.avatar[0]?.url ? getImagePath(host.avatar[0]?.url) : null}
									name={host.name}
								/>
							))}
						</Scrollable>
						{show.hosts.length === 0 && (
							<p className="text-secondary-light">No hosts information available.</p>
						)}
					</div>
				</div>
			</ConstrainedLayout>
		</div>
	)
}

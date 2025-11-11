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
import {episodes} from "@/data/episodes"
import {people} from "@/data/people"
import {podcasts} from "@/data/shows"

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

	const show = podcasts.find((podcast) => podcast.id === showId)

	if (!show) {
		return <div>Show not found</div>
	}

	// Get hosts for this show
	const showHosts =
		show.hostIds.map((hostId) => people.find((person) => person.id === hostId)).filter((h) => h !== undefined) || []

	// Get episodes for this show
	const showEpisodes = episodes.filter((episode) => episode.showId === showId)

	return (
		<div>
			<div className="w-full h-[324px] flex items-center justify-center relative bg-black overflow-hidden">
				<DetailsImage imageUrl={show.imageUrl} />
			</div>
			<ConstrainedLayout>
				<div className="space-y-10">
					<DetailsSummary
						id={show.id}
						type="show"
						description={show.description}
						episodeCount={show.episodeCount}
						tagIds={show.tagIds}
						title={show.title}
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

					<div className={showEpisodes.length === 0 ? "space-y-2" : "space-y-5"}>
						<h2 className="text-medium-title">Episodes</h2>
						<Scrollable gap="gap-3">
							{showEpisodes.map((episode) => (
								<EpisodeCard
									key={episode.id}
									author={episode.author}
									duration={episode.duration}
									id={episode.id}
									name={episode.name}
									publishDate={episode.publishDate}
									description={episode.description}
								/>
							))}
						</Scrollable>
						{showEpisodes.length === 0 && (
							<p className="text-secondary-light">No episodes available yet.</p>
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
				</div>
			</ConstrainedLayout>
		</div>
	)
}

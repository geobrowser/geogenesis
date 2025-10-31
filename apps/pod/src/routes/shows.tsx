import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {PodcastCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {getImagePath} from "@/lib/images"
import {getShowSlug} from "@/lib/slug-mapping"
import {CATEGORIES} from "@/lib/constants"
import {Episode, Podcast} from "@/schema"
import {PODCAST_SPACE_ID} from "@/config"

export const Route = createFileRoute("/shows")({
	component: RouteComponent,
})

function RouteComponent() {
	const {data: allPodcasts} = useQuery(Podcast, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
		},
	})

	const {data: allEpisodes} = useQuery(Episode, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			podcast: {},
		},
	})

	const podcasts = allPodcasts ?? []
	const episodes = allEpisodes ?? []

	// Count episodes per podcast for display
	const episodeCountByPodcast = episodes.reduce(
		(acc, episode) => {
			const podcastId = episode.podcast?.[0]?.id
			if (podcastId) {
				acc[podcastId] = (acc[podcastId] || 0) + 1
			}
			return acc
		},
		{} as Record<string, number>,
	)

	if (podcasts.length === 0) {
		return (
			<ConstrainedLayout>
				<div className="space-y-5">
					<h1 className="text-large-title-desktop">Shows</h1>
					<p className="text-secondary-light">No shows available yet.</p>
				</div>
			</ConstrainedLayout>
		)
	}

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				{CATEGORIES.map((category, index) => (
					<div key={category}>
						<div className="space-y-5">
							<h3 className="text-large-title-desktop">{category}</h3>
							<Scrollable>
								{podcasts.map((podcast) => (
									<div key={podcast.id} className="flex-shrink-0">
										<PodcastCard
											showId={getShowSlug(podcast)}
											imageUrl={
												podcast.avatar?.[0]?.url ? getImagePath(podcast.avatar[0].url) : ""
											}
											title={podcast.name}
											episodeCount={episodeCountByPodcast[podcast.id] ?? 0}
										/>
									</div>
								))}
							</Scrollable>
						</div>
						{index < CATEGORIES.length - 1 && (
							<>
								<div className="mt-10" />
								<Hr />
							</>
						)}
					</div>
				))}
			</div>
		</ConstrainedLayout>
	)
}

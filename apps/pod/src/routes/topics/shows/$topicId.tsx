import {createFileRoute} from "@tanstack/react-router"
import {PodcastCard} from "@/components/ui/card"
import {podcasts} from "@/data/shows"
import {topics} from "@/data/topics"

export const Route = createFileRoute("/topics/shows/$topicId")({
	component: RouteComponent,
})

function RouteComponent() {
	const {topicId} = Route.useParams()

	// Find the topic title for display
	const topic = topics.find((t) => t.id === topicId)
	const topicTitle = topic?.title || topicId

	// Filter podcasts by the topic category
	const topicPodcasts = podcasts.filter((podcast) =>
		podcast.categories.some((category) => category.toLowerCase() === topicId.toLowerCase()),
	)

	if (topicPodcasts.length === 0) {
		return (
			<div className="text-center py-20">
				<h2 className="text-large-title-desktop mb-4">No podcasts found</h2>
				<p className="text-secondary-light">
					There are no podcasts available for "{topicTitle}" at the moment.
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-5">
			<h1 className="text-large-title-desktop">All {topicTitle.toLowerCase()} podcasts</h1>

			<div className="flex flex-wrap gap-3 gap-y-10">
				{topicPodcasts.map((podcast) => (
					<div key={podcast.id} className="flex-shrink-0">
						<PodcastCard
							showId={podcast.id}
							imageUrl={podcast.imageUrl}
							title={podcast.title}
							episodeCount={podcast.episodeCount}
						/>
					</div>
				))}
			</div>
		</div>
	)
}

import {createFileRoute} from "@tanstack/react-router"
import {EpisodeCard} from "@/components/ui/card"
import {episodes} from "@/data/episodes"
import {topics} from "@/data/topics"

export const Route = createFileRoute("/topics/episodes/$topicId")({
	component: RouteComponent,
})

function RouteComponent() {
	const {topicId} = Route.useParams()

	// Find the topic title for display
	const topic = topics.find((t) => t.id === topicId)
	const topicTitle = topic?.title || topicId

	// Filter episodes by the topic category
	const topicEpisodes = episodes.filter((episode) =>
		episode.categories.some((category) => category.toLowerCase() === topicId.toLowerCase()),
	)

	if (topicEpisodes.length === 0) {
		return (
			<div className="text-center py-20">
				<h2 className="text-large-title-desktop mb-4">No episodes found</h2>
				<p className="text-secondary-light">
					There are no episodes available for "{topicTitle}" at the moment.
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-5">
			<h1 className="text-large-title-desktop">All {topicTitle.toLowerCase()} episodes</h1>

			<div className="flex flex-wrap gap-3 gap-y-3">
				{topicEpisodes.map((episode) => (
					<div key={episode.id} className="flex-shrink-0">
						<EpisodeCard
							id={episode.id}
							name={episode.name}
							author={episode.author}
							description={episode.description}
							publishDate={episode.publishDate}
							duration={episode.duration}
						/>
					</div>
				))}
			</div>
		</div>
	)
}

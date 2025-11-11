import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {EpisodeCard, PersonCard, PodcastCard, TopicCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {episodes} from "@/data/episodes"
import {people} from "@/data/people"
import {savedItems} from "@/data/saved"
import {podcasts} from "@/data/shows"
import {topics} from "@/data/topics"

export const Route = createFileRoute("/saved")({
	component: RouteComponent,
})

function RouteComponent() {
	const savedShows = savedItems
		.filter((item) => item.type === "show")
		.map((item) => podcasts.find((show) => show.id === item.showId))
		.filter((s) => s !== undefined)

	const savedEpisodes = savedItems
		.filter((item) => item.type === "episode")
		.map((item) => episodes.find((episode) => episode.id === item.episodeId))
		.filter((s) => s !== undefined)

	const savedTopics = savedItems
		.filter((item) => item.type === "topic")
		.map((item) => topics.find((topic) => topic.id === item.topicId))
		.filter((s) => s !== undefined)

	const savedPeople = savedItems
		.filter((item) => item.type === "people")
		.map((item) => people.find((person) => person.id === item.personId))
		.filter((s) => s !== undefined)

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				{savedShows.length > 0 && (
					<>
						<div className="space-y-5">
							<h3 className="text-large-title-desktop">Shows</h3>
							<Scrollable gap="gap-3">
								{savedShows.map((podcast) => (
									<div key={podcast.id} className="flex-shrink-0">
										<PodcastCard
											showId={podcast.id}
											imageUrl={podcast.imageUrl}
											title={podcast.title}
											episodeCount={podcast.episodeCount}
										/>
									</div>
								))}
							</Scrollable>
						</div>
						<Hr />
					</>
				)}

				{savedEpisodes.length > 0 && (
					<>
						<div className="space-y-5">
							<h3 className="text-large-title-desktop">Episodes</h3>
							<Scrollable>
								{savedEpisodes.map((episode) => (
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
							</Scrollable>
						</div>
						<Hr />
					</>
				)}

				{savedTopics.length > 0 && (
					<>
						<div className="space-y-5">
							<h3 className="text-large-title-desktop">Topics</h3>
							<Scrollable>
								{savedTopics.map((topic) => (
									<div key={topic.id} className="flex-shrink-0">
										<TopicCard imageUrl={topic.imageUrl} title={topic.title} />
									</div>
								))}
							</Scrollable>
						</div>
						<Hr />
					</>
				)}

				{savedPeople.length > 0 && (
					<div className="space-y-5">
						<h3 className="text-large-title-desktop">Hosts & guests</h3>
						<Scrollable>
							{savedPeople.map((person) => (
								<div key={person.id} className="flex-shrink-0">
									<PersonCard avatarUrl={person.avatarUrl} name={person.name} />
								</div>
							))}
						</Scrollable>
					</div>
				)}
			</div>
		</ConstrainedLayout>
	)
}

import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute} from "@tanstack/react-router"
import {useState} from "react"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {ViewAll} from "@/components/ui/button"
import {EpisodeCard, PersonCard, PodcastCard, TopicCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {Tab} from "@/components/ui/tab"
import {getImagePath} from "@/lib/images"
import {getShowSlug} from "@/lib/slug-mapping"
import {CATEGORIES} from "@/lib/constants"
import {Episode, Person, Podcast, Topic} from "@/schema"
import {PODCAST_SPACE_ID} from "@/config"

export const Route = createFileRoute("/")({
	component: Home,
})

function Home() {
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
			avatar: {},
			podcast: {},
		},
	})

	const {data: allTopics} = useQuery(Topic, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
		},
	})

	const {data: allPeople} = useQuery(Person, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
		},
	})

	const podcasts = allPodcasts ?? []
	const episodes = allEpisodes ?? []
	const topics = allTopics ?? []
	const people = allPeople ?? []

	// Tab selection state (tabs don't filter yet, just visual)
	const [selectedTag, setSelectedTag] = useState<string>("Trending")
	const [podcastSelectedTag, setPodcastSelectedTag] = useState<string>("Trending")

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

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Trending podcasts</h3>
						<ViewAll to="/shows" />
					</div>
					<div className="flex items-center gap-1.5">
						{CATEGORIES.map((tag) => (
							<Tab
								key={tag}
								variant={podcastSelectedTag === tag ? undefined : "secondary"}
								onClick={() => setPodcastSelectedTag(tag)}
								className="cursor-pointer"
							>
								{tag}
							</Tab>
						))}
					</div>
					<Scrollable>
						{podcasts.map((podcast) => (
							<div key={podcast.id} className="flex-shrink-0">
								<PodcastCard
									showId={getShowSlug(podcast)}
									imageUrl={podcast.avatar?.[0]?.url ? getImagePath(podcast.avatar[0].url) : ""}
									title={podcast.name}
									episodeCount={episodeCountByPodcast[podcast.id] ?? 0}
								/>
							</div>
						))}
					</Scrollable>
				</div>

				<Hr />
				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Top episodes</h3>
						<ViewAll to="/episodes" />
					</div>
					<div className="flex items-center gap-1.5">
						{CATEGORIES.map((tag) => (
							<Tab
								key={tag}
								variant={selectedTag === tag ? undefined : "secondary"}
								onClick={() => setSelectedTag(tag)}
								className="cursor-pointer"
							>
								{tag}
							</Tab>
						))}
					</div>
					<Scrollable>
						{episodes.map((episode) => (
							<div key={episode.id} className="flex-shrink-0">
								<EpisodeCard
									id={episode.id}
									name={episode.name}
									author={episode.podcast?.[0]?.name ?? "Unknown"}
									description={episode.description}
									publishDate={episode.airDate.toISOString()}
									duration={episode.duration}
									coverImg={episode.avatar?.[0]?.url ? getImagePath(episode.avatar[0].url) : null}
								/>
							</div>
						))}
					</Scrollable>
				</div>

				<Hr />

				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Topics</h3>
						<ViewAll to="/topics" />
					</div>

					{topics.length > 0 ? (
						<Scrollable>
							{topics.map((topic) => (
								<div key={topic.id} className="flex-shrink-0">
									<TopicCard
										imageUrl={topic.avatar?.[0]?.url ? getImagePath(topic.avatar[0].url) : null}
										title={topic.name}
									/>
								</div>
							))}
						</Scrollable>
					) : (
						<p className="text-secondary-light">No topics available yet.</p>
					)}
				</div>

				<Hr />

				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Top guests</h3>
						<ViewAll to="/" />
					</div>

					{people.length > 0 ? (
						<Scrollable>
							{people.map((person) => (
								<div key={person.id} className="flex-shrink-0">
									<PersonCard
										avatarUrl={person.avatar?.[0]?.url ? getImagePath(person.avatar[0].url) : null}
										name={person.name}
									/>
								</div>
							))}
						</Scrollable>
					) : (
						<p className="text-secondary-light">No guests available yet.</p>
					)}
				</div>
			</div>
		</ConstrainedLayout>
	)
}

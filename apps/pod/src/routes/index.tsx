import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {ViewAll} from "@/components/ui/button"
import {EpisodeCard, PersonCard, PodcastCard, TopicCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {Tab} from "@/components/ui/tab"
import {episodes} from "@/data/episodes"
import {people} from "@/data/people"
import {podcasts} from "@/data/shows"
import {topics} from "@/data/topics"
import {useFilter} from "@/hooks/use-filter"

export const Route = createFileRoute("/")({
	component: Home,
})

function Home() {
	const {selectedTag, setSelectedTag, filteredItems: filteredEpisodes, availableTags} = useFilter(episodes)
	const {
		selectedTag: podcastSelectedTag,
		setSelectedTag: setPodcastSelectedTag,
		filteredItems: filteredPodcasts,
		availableTags: podcastAvailableTags,
	} = useFilter(podcasts)

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Trending podcasts</h3>
						<ViewAll to="/shows" />
					</div>
					<div className="flex items-center gap-1.5">
						{podcastAvailableTags.map((tag) => (
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
					<Scrollable gap="gap-3">
						{filteredPodcasts.map((podcast) => (
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
				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Top episodes</h3>
						<ViewAll to="/episodes" />
					</div>
					<div className="flex items-center gap-1.5">
						{availableTags.map((tag) => (
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
						{filteredEpisodes.map((episode) => (
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

				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Topics</h3>
						<ViewAll to="/topics" />
					</div>

					<Scrollable>
						{topics.map((topic) => (
							<div key={topic.id} className="flex-shrink-0">
								<TopicCard imageUrl={topic.imageUrl} title={topic.title} />
							</div>
						))}
					</Scrollable>
				</div>

				<Hr />

				<div className="space-y-5">
					<div className="flex items-baseline justify-between">
						<h3 className="text-large-title-desktop">Top guests</h3>
						<ViewAll to="/" />
					</div>

					<Scrollable>
						{people.map((guest) => (
							<div key={guest.id} className="flex-shrink-0">
								<PersonCard avatarUrl={guest.avatarUrl} name={guest.name} />
							</div>
						))}
					</Scrollable>
				</div>
			</div>
		</ConstrainedLayout>
	)
}

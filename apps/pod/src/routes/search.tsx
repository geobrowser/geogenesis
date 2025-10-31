import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute} from "@tanstack/react-router"
import fuzzysort from "fuzzysort"
import React from "react"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {EpisodeCard, PersonCard, PodcastCard, TopicCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {PODCAST_SPACE_ID} from "@/config"
import {getImagePath} from "@/lib/images"
import {getShowSlug} from "@/lib/slug-mapping"
import {Episode, Person, Podcast, Topic} from "@/schema"

type Search = {
	q: string
}

export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>): Search => {
		// validate and parse the search params into a typed state
		return {
			q: (search?.q as string) ?? "",
		}
	},
	component: SearchPage,
})

function SearchPage() {
	const {q: searchText} = Route.useSearch()

	// Fetch all data from GraphQL
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

	const {data: allPeople} = useQuery(Person, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
		},
	})

	const {data: allTopics} = useQuery(Topic, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
		},
	})

	const podcasts = allPodcasts ?? []
	const episodes = allEpisodes ?? []
	const people = allPeople ?? []
	const topics = allTopics ?? []

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

	// Perform fuzzy search
	const {foundShows, foundEpisodes, foundPeople, foundTopics} = React.useMemo(() => {
		if (!searchText) {
			return {
				foundShows: [],
				foundEpisodes: [],
				foundPeople: [],
				foundTopics: [],
			}
		}

		const foundShows = fuzzysort.go(searchText, podcasts, {
			keys: ["name", "description"],
			scoreFn: (r) => r.score * (r.obj.name ? 2 : 1),
			limit: 30,
			threshold: 0.75,
		})

		const foundEpisodes = fuzzysort.go(searchText, episodes, {
			keys: ["name", "description"],
			scoreFn: (r) => r.score * (r.obj.name ? 2 : 1),
			limit: 30,
			threshold: 0.75,
		})

		const foundPeople = fuzzysort.go(searchText, people, {
			keys: ["name"],
			scoreFn: (r) => r.score * (r.obj.name ? 2 : 1),
			limit: 30,
			threshold: 0.75,
		})

		const foundTopics = fuzzysort.go(searchText, topics, {
			keys: ["name"],
			scoreFn: (r) => r.score * (r.obj.name ? 2 : 1),
			limit: 30,
			threshold: 0.75,
		})

		return {
			foundShows: foundShows.map((f) => f.obj),
			foundEpisodes: foundEpisodes.map((f) => f.obj),
			foundPeople: foundPeople.map((f) => f.obj),
			foundTopics: foundTopics.map((f) => f.obj),
		}
	}, [searchText, podcasts, episodes, people, topics])

	const hasNoResults =
		searchText &&
		foundShows.length === 0 &&
		foundEpisodes.length === 0 &&
		foundPeople.length === 0 &&
		foundTopics.length === 0

	if (!searchText) {
		return (
			<div className="flex items-center justify-center min-h-[70vh]">
				<div className="text-center space-y-10">
					<div className="space-y-5">
						<h2 className="text-medium-title text-primary-text">Search for podcasts</h2>
						<p className="text-body text-secondary-light w-[364px]">
							Start typing to search for shows, episodes, topics, and people.
						</p>
					</div>
					<img src="/empty-search.png" alt="Search for podcasts" className="w-[337px] h-auto mx-auto" />
				</div>
			</div>
		)
	}

	if (hasNoResults) {
		return (
			<div className="flex items-center justify-center min-h-[70vh]">
				<div className="text-center space-y-10">
					<div className="space-y-5">
						<h2 className="text-medium-title text-primary-text">No results found... yet</h2>
						<p className="text-body text-secondary-light w-[364px]">
							We couldn't find anything matching your search.
							<br />
							Check back later for new content.
						</p>
					</div>
					<img src="/empty-search.png" alt="No search results" className="w-[337px] h-auto mx-auto" />
				</div>
			</div>
		)
	}

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				{foundShows.length > 0 && (
					<>
						<div className="space-y-5">
							<h2 className="text-large-title-desktop">
								{foundShows.length} {foundShows.length === 1 ? "show" : "shows"}
							</h2>
							<Scrollable>
								{foundShows.map((podcast) => (
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
						{(foundEpisodes.length > 0 || foundTopics.length > 0 || foundPeople.length > 0) && <Hr />}
					</>
				)}

				{foundEpisodes.length > 0 && (
					<>
						<div className="space-y-5">
							<h2 className="text-large-title-desktop">
								{foundEpisodes.length} {foundEpisodes.length === 1 ? "episode" : "episodes"}
							</h2>
							<Scrollable>
								{foundEpisodes.map((episode) => (
									<div key={episode.id} className="flex-shrink-0">
										<EpisodeCard
											id={episode.id}
											name={episode.name}
											author={episode.podcast?.[0]?.name ?? "Unknown"}
											description={episode.description}
											publishDate={episode.airDate.toISOString()}
											duration={episode.duration}
											coverImg={
												episode.avatar?.[0]?.url ? getImagePath(episode.avatar[0].url) : null
											}
										/>
									</div>
								))}
							</Scrollable>
						</div>
						{(foundTopics.length > 0 || foundPeople.length > 0) && <Hr />}
					</>
				)}

				{foundTopics.length > 0 && (
					<>
						<div className="space-y-5">
							<h2 className="text-large-title-desktop">
								{foundTopics.length} {foundTopics.length === 1 ? "topic" : "topics"}
							</h2>
							<Scrollable>
								{foundTopics.map((topic) => (
									<div key={topic.id} className="flex-shrink-0">
										<TopicCard
											imageUrl={topic.avatar?.[0]?.url ? getImagePath(topic.avatar[0].url) : null}
											title={topic.name}
										/>
									</div>
								))}
							</Scrollable>
						</div>
						{foundPeople.length > 0 && <Hr />}
					</>
				)}

				{foundPeople.length > 0 && (
					<div className="space-y-5">
						<h2 className="text-large-title-desktop">
							{foundPeople.length} {foundPeople.length === 1 ? "person" : "people"}
						</h2>
						<Scrollable>
							{foundPeople.map((person) => (
								<div key={person.id} className="flex-shrink-0">
									<PersonCard
										avatarUrl={person.avatar?.[0]?.url ? getImagePath(person.avatar[0].url) : null}
										name={person.name}
									/>
								</div>
							))}
						</Scrollable>
					</div>
				)}
			</div>
		</ConstrainedLayout>
	)
}

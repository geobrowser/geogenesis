import {createFileRoute} from "@tanstack/react-router"
import fuzzysort from "fuzzysort"
import * as React from "react"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {EpisodeCard, PersonCard, PodcastCard, TopicCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {episodes} from "@/data/episodes"
import {people} from "@/data/people"
import {podcasts} from "@/data/shows"
import {topics} from "@/data/topics"

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

	const {foundShows, foundEpisodes, foundPeople, foundTopics} = React.useMemo(() => {
		const foundShows = fuzzysort.go(searchText, podcasts, {
			keys: ["title", "description"],
			scoreFn: (r) => r.score * (r.obj.title ? 2 : 1),
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
			keys: ["title"],
			scoreFn: (r) => r.score * (r.obj.title ? 2 : 1),
			limit: 30,
			threshold: 0.75,
		})

		return {
			foundShows: foundShows.map((f) => f.obj),
			foundEpisodes: foundEpisodes.map((f) => f.obj),
			foundPeople: foundPeople.map((f) => f.obj),
			foundTopics: foundTopics.map((f) => f.obj),
		}
	}, [searchText])

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
					<div className="space-y-5">
						<h2 className="text-large-title-desktop">
							{foundShows.length} {foundShows.length === 1 ? "show" : "shows"}
						</h2>
						<Scrollable gap="gap-3">
							{foundShows.map((podcast) => (
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
				)}

				{foundShows.length > 0 && foundEpisodes.length > 0 && <Hr />}

				{foundEpisodes.length > 0 && (
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
										author={episode.author}
										description={episode.description}
										publishDate={episode.publishDate}
										duration={episode.duration}
									/>
								</div>
							))}
						</Scrollable>
					</div>
				)}

				{(foundShows.length > 0 || foundEpisodes.length > 0) && foundTopics.length > 0 && <Hr />}

				{foundTopics.length > 0 && (
					<div className="space-y-5">
						<h2 className="text-large-title-desktop">
							{foundTopics.length} {foundTopics.length === 1 ? "topic" : "topics"}
						</h2>
						<Scrollable>
							{foundTopics.map((topic) => (
								<div key={topic.id} className="flex-shrink-0">
									<TopicCard imageUrl={topic.imageUrl} title={topic.title} />
								</div>
							))}
						</Scrollable>
					</div>
				)}

				{(foundShows.length > 0 || foundEpisodes.length > 0 || foundTopics.length > 0) &&
					foundPeople.length > 0 && <Hr />}

				{foundPeople.length > 0 && (
					<div className="space-y-5">
						<h2 className="text-large-title-desktop">
							{foundPeople.length} {foundPeople.length === 1 ? "person" : "people"}
						</h2>
						<Scrollable>
							{foundPeople.map((person) => (
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

import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {ViewAll} from "@/components/ui/button"
import {PodcastCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {podcasts} from "@/data/shows"

export const Route = createFileRoute("/shows")({
	component: RouteComponent,
})

const topicCategoriesConfig = [
	{id: "trending", title: "Trending"},
	{id: "business", title: "Business"},
	{id: "crime", title: "True Crime"},
	{id: "health", title: "Health & Wellness"},
	{id: "technology", title: "Technology"},
	{id: "movies", title: "Movies & Entertainment"},
	{id: "crypto", title: "Crypto & Finance"},
	{id: "news", title: "News & Politics"},
	{id: "comedy", title: "Comedy"},
	{id: "history", title: "History"},
	{id: "food", title: "Food & Cooking"},
	{id: "music", title: "Music"},
	{id: "relationships", title: "Relationships & Romance"},
	{id: "education", title: "Education"},
	{id: "sports", title: "Sports"},
	{id: "travel", title: "Travel"},
	{id: "spirituality", title: "Spirituality & Wellness"},
	{id: "arts", title: "Arts & Culture"},
	{id: "science", title: "Science"},
	{id: "finance", title: "Finance & Investing"},
	{id: "politics", title: "Politics"},
]

function RouteComponent() {
	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				{topicCategoriesConfig.map((category, index) => {
					const categoryShows = podcasts.filter((podcast) =>
						podcast.categories.map((c) => c.toLowerCase()).includes(category.id.toLowerCase()),
					)

					if (categoryShows.length === 0) return null

					return (
						<div key={category.id}>
							<div className="space-y-5">
								<div className="flex items-baseline justify-between">
									<h3 className="text-large-title-desktop">{category.title}</h3>
									<ViewAll to={`/topics/shows/${category.id}`} />
								</div>
								<Scrollable>
									{categoryShows.map((podcast) => (
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
							{index < topicCategoriesConfig.length - 1 && (
								<div>
									<div className="mt-10" />
									<Hr />
								</div>
							)}
						</div>
					)
				})}
			</div>
		</ConstrainedLayout>
	)
}

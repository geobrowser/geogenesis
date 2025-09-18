import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {ViewAll} from "@/components/ui/button"
import {EpisodeCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {episodes} from "@/data/episodes"

export const Route = createFileRoute("/episodes")({
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
					const categoryEpisodes = episodes.filter((episode) =>
						episode.categories.map((c) => c.toLowerCase()).includes(category.id.toLowerCase()),
					)

					if (categoryEpisodes.length === 0) return null

					return (
						<div key={category.id}>
							<div className="space-y-5">
								<div className="flex items-baseline justify-between">
									<h3 className="text-large-title-desktop">{category.title}</h3>
									<ViewAll to={`/topics/episodes/${category.id}`} />
								</div>
								<Scrollable>
									{categoryEpisodes.map((episode) => (
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
							{index < topicCategoriesConfig.length - 1 && (
								<>
									<div className="mt-10" />
									<Hr />
								</>
							)}
						</div>
					)
				})}
			</div>
		</ConstrainedLayout>
	)
}

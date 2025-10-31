import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {TopicCard} from "@/components/ui/card"
import {getImagePath} from "@/lib/images"
import {Topic} from "@/schema"
import {PODCAST_SPACE_ID} from "@/config"

export const Route = createFileRoute("/topics")({
	component: RouteComponent,
})

function RouteComponent() {
	const {data: allTopics} = useQuery(Topic, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
		},
	})

	const topics = allTopics ?? []

	return (
		<ConstrainedLayout>
			<div className="space-y-5">
				<h1 className="text-large-title-desktop">Topics</h1>
				{topics.length === 0 ? (
					<p className="text-secondary-light">No topics available yet.</p>
				) : (
					<div className="flex flex-wrap gap-3 gap-y-10">
						{topics.map((topic) => (
							<div key={topic.id} className="cursor-pointer">
								<TopicCard
									imageUrl={topic.avatar?.[0]?.url ? getImagePath(topic.avatar[0].url) : null}
									title={topic.name}
								/>
							</div>
						))}
					</div>
				)}
			</div>
		</ConstrainedLayout>
	)
}

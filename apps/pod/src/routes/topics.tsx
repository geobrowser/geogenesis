import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {TopicCard} from "@/components/ui/card"
import {topics} from "@/data/topics"

export const Route = createFileRoute("/topics")({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<ConstrainedLayout>
			<div className="space-y-5">
				<h1 className="text-large-title-desktop">Topics</h1>
				<div className="flex flex-wrap gap-3 gap-y-10">
					{topics.map((topic) => (
						<div key={topic.id} className="cursor-pointer">
							<TopicCard imageUrl={topic.imageUrl} title={topic.title} />
						</div>
					))}
				</div>
			</div>
		</ConstrainedLayout>
	)
}

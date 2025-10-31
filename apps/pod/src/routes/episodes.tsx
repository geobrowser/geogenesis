import {useQuery} from "@graphprotocol/hypergraph-react"
import {createFileRoute} from "@tanstack/react-router"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {EpisodeCard} from "@/components/ui/card"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"
import {getImagePath} from "@/lib/images"
import {CATEGORIES} from "@/lib/constants"
import {Episode} from "@/schema"
import {PODCAST_SPACE_ID} from "@/config"

export const Route = createFileRoute("/episodes")({
	component: RouteComponent,
})

function RouteComponent() {
	const {data: allEpisodes} = useQuery(Episode, {
		mode: "public",
		space: PODCAST_SPACE_ID,
		include: {
			avatar: {},
			podcast: {},
		},
	})

	const episodes = allEpisodes ?? []

	if (episodes.length === 0) {
		return (
			<ConstrainedLayout>
				<div className="space-y-5">
					<h1 className="text-large-title-desktop">Episodes</h1>
					<p className="text-secondary-light">No episodes available yet.</p>
				</div>
			</ConstrainedLayout>
		)
	}

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				{CATEGORIES.map((category, index) => (
					<div key={category}>
						<div className="space-y-5">
							<h3 className="text-large-title-desktop">{category}</h3>
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
											coverImg={
												episode.avatar?.[0]?.url ? getImagePath(episode.avatar[0].url) : null
											}
										/>
									</div>
								))}
							</Scrollable>
						</div>
						{index < CATEGORIES.length - 1 && (
							<>
								<div className="mt-10" />
								<Hr />
							</>
						)}
					</div>
				))}
			</div>
		</ConstrainedLayout>
	)
}

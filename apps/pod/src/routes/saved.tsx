import {createFileRoute} from "@tanstack/react-router"
import cx from "clsx"
import {ConstrainedLayout} from "@/components/layouts/constrained"
import {Hr} from "@/components/ui/hr"
import {Scrollable} from "@/components/ui/scrollable"

export const Route = createFileRoute("/saved")({
	component: RouteComponent,
})

function EmptyCard({message, className}: {message: string; className?: string}) {
	return (
		<div className={cx("flex items-center justify-center bg-secondary-darkest rounded-[30px]", className)}>
			<p className="text-secondary-light">{message}</p>
		</div>
	)
}

function EmptyPersonCard({message}: {message: string}) {
	return (
		<div className="flex flex-col items-center space-y-3">
			<div className="w-[180px] h-[180px] rounded-full bg-secondary-darkest flex items-center justify-center">
				<p className="text-secondary-light text-center px-4">{message}</p>
			</div>
		</div>
	)
}

function RouteComponent() {
	const savedShows: never[] = []
	const savedEpisodes: never[] = []
	const savedTopics: never[] = []
	const savedPeople: never[] = []

	return (
		<ConstrainedLayout>
			<div className="space-y-10">
				<div className="space-y-5">
					<h3 className="text-large-title-desktop">Shows</h3>
					<Scrollable>
						<EmptyCard message="No saved shows yet." className="w-[180px] h-[180px]" />
					</Scrollable>
				</div>

				<Hr />

				<div className="space-y-5">
					<h3 className="text-large-title-desktop">Episodes</h3>
					<Scrollable>
						<EmptyCard message="No saved episodes yet." className="w-[400px] h-[120px]" />
					</Scrollable>
				</div>

				<Hr />

				<div className="space-y-5">
					<h3 className="text-large-title-desktop">Topics</h3>
					<Scrollable>
						<EmptyCard message="No saved topics yet." className="w-[180px] h-[180px]" />
					</Scrollable>
				</div>

				<Hr />

				<div className="space-y-5">
					<h3 className="text-large-title-desktop">Hosts & guests</h3>
					<Scrollable>
						<EmptyPersonCard message="No saved hosts or guests yet." />
					</Scrollable>
				</div>
			</div>
		</ConstrainedLayout>
	)
}

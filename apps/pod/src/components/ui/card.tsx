import {Link} from "@tanstack/react-router"
import {formatDuration} from "@/lib/utils"
import {PlaceholderImageLoader} from "./placeholder-image-loader"

type EpisodeCardProps = {
	id: string
	coverImg: string | null
	name: string
	author: string
	description?: string | null
	publishDate: string
	duration: number
}

export function EpisodeCard({id, name, author, description, publishDate, duration, coverImg}: EpisodeCardProps) {
	const formattedDate = new Date(publishDate).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	})

	const formattedDuration = formatDuration(duration)

	return (
		<Link to="/episodes/$episodeId" params={{episodeId: id}} draggable={false}>
			<div className="w-[373px] rounded-[30px] p-5 bg-secondary-darkest space-y-4 flex-shrink-0">
				<div className="flex items-center gap-4">
					<div className="w-15 h-15 rounded-lg overflow-hidden relative">
						<PlaceholderImageLoader />
						<img
							src={coverImg ?? undefined}
							alt={name}
							className="w-full h-full object-cover relative z-10"
							draggable={false}
						/>
					</div>
					<div className="space-y-1">
						<h2 className="text-small-title">{name}</h2>
						<h3 className="text-caption text-secondary-light font-medium">{author}</h3>
					</div>
				</div>
				<div className="space-y-3">
					<p className="line-clamp-3 break-words">{description}</p>
					<div className="flex items-center gap-2 text-caption font-medium text-secondary-light">
						<span>{formattedDate}</span>
						<span>·</span>
						<span>{formattedDuration}</span>
					</div>
				</div>
			</div>
		</Link>
	)
}

type TopicCardProps = {
	imageUrl: string | null
	title: string
}

export function TopicCard({imageUrl, title}: TopicCardProps) {
	return (
		<div className="w-[180px] space-y-3">
			<div className="w-full h-[90px] rounded-[20px] overflow-hidden relative bg-secondary-darkest">
				{imageUrl && (
					<>
						<PlaceholderImageLoader />
						<img
							src={imageUrl}
							alt={title}
							className="w-full h-full object-cover relative z-10"
							draggable={false}
						/>
					</>
				)}
			</div>
			<h3 className="text-small-title text-center">{title}</h3>
		</div>
	)
}

type PodcastCardProps = {
	imageUrl: string
	showId: string
	title: string
	episodeCount: number
}

export function PodcastCard({showId, imageUrl, title, episodeCount}: PodcastCardProps) {
	return (
		<Link to="/shows/$showId" params={{showId}} className="w-[180px] space-y-3" draggable={false}>
			<div className="w-[180px] h-[180px] rounded-[20px] overflow-hidden relative">
				<PlaceholderImageLoader />
				<img
					src={imageUrl}
					alt={title}
					className="w-[180px] h-[180px] object-cover relative z-10"
					draggable={false}
				/>
			</div>
			<div className="w-[180px] space-y-1.5 px-2.5 mx-auto">
				<h3 className="break-words text-small-title font-bold leading-tight">{title}</h3>
				<p className="text-secondary-light text-sm">
					{episodeCount} episode{episodeCount !== 1 ? "s" : ""}
				</p>
			</div>
		</Link>
	)
}

type PersonCardProps = {
	avatarUrl: string | null
	name: string
}

export function PersonCard({avatarUrl, name}: PersonCardProps) {
	return (
		<div className="flex flex-col items-center space-y-3">
			<div className="w-[180px] h-[180px] rounded-full overflow-hidden relative">
				<PlaceholderImageLoader />
				<img
					src={avatarUrl ?? undefined}
					alt={name}
					className="w-full h-full object-cover relative z-10"
					draggable={false}
				/>
			</div>
			<h3 className="text-small-title text-center">{name}</h3>
		</div>
	)
}

type QuoteCardProps = {
	quote: string
	personImageUrl?: string
	personName?: string
	timestamp: string
}

export function QuoteCard({quote, personName, personImageUrl, timestamp}: QuoteCardProps) {
	return (
		<div className="w-full bg-secondary-darkest rounded-[30px] p-6 space-y-4">
			<div className="flex items-baseline justify-between font-medium text-caption text-secondary-light">
				<div className="flex items-center gap-2">
					<div className="h-[30px] w-[30px] rounded-full overflow-hidden relative">
						<PlaceholderImageLoader />
						<img
							className="h-[30px] w-[30px] object-fill rounded-full relative z-10"
							src={personImageUrl}
							alt=""
						/>
					</div>
					<span>{personName}</span>
				</div>
				<span>{timestamp}</span>
			</div>
			<blockquote>"{quote}"</blockquote>
			<div className="flex items-center justify-between text-sm text-secondary-light"></div>
		</div>
	)
}

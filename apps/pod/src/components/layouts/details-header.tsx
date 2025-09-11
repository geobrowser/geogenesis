import {AnimatePresence, motion} from "framer-motion"
import {tags} from "@/data/tags"
import {useBookmark} from "@/hooks/use-bookmark"
import {BookmarkType} from "@/schema"
import {Save} from "../icons/save"
import {Hr} from "../ui/hr"
import {PlaceholderImageLoader} from "../ui/placeholder-image-loader"
import {Tag} from "../ui/tag"

type DetailsImageProps = {
	imageUrl: string | null
}

export function DetailsImage({imageUrl}: DetailsImageProps) {
	return (
		<div className="w-full h-[324px] flex items-center justify-center relative bg-black overflow-hidden">
			{/* Background image */}
			<img
				src={imageUrl ?? undefined}
				alt=""
				className="absolute inset-0 w-full h-full object-cover blur-[6px]"
			/>

			{/* Combined overlay with reduced opacity */}
			<div className="absolute inset-0 bg-gradient-to-b from-primary-black/10 to-primary-black"></div>

			{/* Centered podcast image */}
			<div className="w-[264px] h-[264px] relative rounded-[30px] overflow-hidden shadow-image">
				<PlaceholderImageLoader />
				<img
					src={imageUrl ?? undefined}
					alt=""
					className="w-[264px] h-[264px] rounded-[30px] relative z-10 object-cover"
				/>
			</div>
		</div>
	)
}

type DetailsSummaryProps = {
	id: string
	type: "episode" | "show"
	title: string
	episodeCount: number
	description: string
	tagIds: string[]
}

export function DetailsSummary({id, type, title, episodeCount, description, tagIds}: DetailsSummaryProps) {
	const renderedTags = tagIds.map((tagId) => tags.find((tag) => tag.id === tagId)).filter((t) => t !== undefined)

	const {bookmark: maybeBookmark, onBookmark} = useBookmark(id, BookmarkType.Show)

	return (
		<>
			<div className="space-y-3">
				<div className="flex items-baseline justify-between w-full">
					<h1 className="text-large-title-desktop">{title}</h1>
					<SaveButton
						isSaved={Boolean(maybeBookmark)}
						onClick={() =>
							onBookmark({
								bookmarkedId: id,
								bookmarkType: type === "episode" ? BookmarkType.Episode : BookmarkType.Show,
							})
						}
					/>
				</div>
				<h3 className="text-secondary-light text-caption">
					{episodeCount} {episodeCount === 1 ? "episode" : "episodes"}
				</h3>
			</div>

			<Hr />

			<div className="space-y-6">
				<div className="space-y-4">
					<h2 className="text-medium-title">Summary</h2>
					<p>{description}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{renderedTags.map((tag) => (
						<Tag key={tag.id}>{tag.name}</Tag>
					))}
				</div>
			</div>
		</>
	)
}

function SaveButton({isSaved, onClick}: {isSaved: boolean; onClick: () => void}) {
	return (
		<motion.button
			onClick={onClick}
			className={`h-[30px] rounded-full flex items-center justify-center overflow-hidden cursor-pointer ${
				isSaved
					? "bg-primary-cta text-primary-black text-caption gap-2"
					: "bg-secondary-darkest text-secondary-light"
			}`}
			animate={{width: isSaved ? 79 : 30}}
			transition={{type: "spring", stiffness: 400, damping: 25}}
		>
			<Save />
			<AnimatePresence>
				{isSaved && (
					<motion.span
						initial={{opacity: 0, filter: "blur(8px)", width: 0}}
						animate={{opacity: 1, filter: "blur(0px)", width: "auto"}}
						exit={{opacity: 0, filter: "blur(8px)", width: 0}}
						transition={{duration: 0.1}}
					>
						Saved
					</motion.span>
				)}
			</AnimatePresence>
		</motion.button>
	)
}

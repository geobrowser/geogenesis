import {useMemo, useState} from "react"
import {useMobile} from "@/hooks/use-mobile"

const availableTags = [
	"Trending",
	"Business",
	"Crypto",
	"Finance",
	"Crime",
	"Relationships",
	"Health",
	"Movies",
] as const

export type Tag = (typeof availableTags)[number]

type FilterableItem = {
	categories: string[]
}

export function useFilter<T extends FilterableItem>(items: T[]) {
	const [selectedTag, setSelectedTag] = useState<Tag>("Trending")
	const isMobile = useMobile()

	const filteredItems = useMemo(() => {
		const filtered = items.filter((item) => item.categories.includes(selectedTag))

		if (isMobile) {
			return filtered.slice(0, 3)
		}

		return filtered
	}, [items, selectedTag, isMobile])

	return {
		selectedTag,
		setSelectedTag,
		filteredItems,
		availableTags,
	}
}
